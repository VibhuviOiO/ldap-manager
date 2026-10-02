import ldap
import ldap.controls
import ldap.filter
import logging
import threading
from ldap.controls import SimplePagedResultsControl
from typing import List, Dict, Optional, Tuple
from pydantic import BaseModel

logger = logging.getLogger(__name__)

# python-ldap keeps TLS settings in ONE process-global context, so two
# connections with different CA files - or different verify settings - clobber
# each other if they are set up concurrently. Serialising the setup and the
# handshake is the only way to make per-cluster TLS correct.
_TLS_LOCK = threading.Lock()


def tls_kwargs(cluster) -> Dict:
    """
    TLS options for a cluster's connections, as LDAPConfig kwargs.

    Returns {} when TLS is off, so call sites can splat it unconditionally.
    """
    mode = str(getattr(cluster, "tls_mode", "none") or "none").lower()
    if mode not in ("ldaps", "starttls"):
        return {}
    return {
        "tls_mode": mode,
        "tls_ca_file": getattr(cluster, "tls_ca_file", None),
        "tls_cert_file": getattr(cluster, "tls_cert_file", None),
        "tls_key_file": getattr(cluster, "tls_key_file", None),
        "tls_verify": bool(getattr(cluster, "tls_verify", True)),
    }


class LDAPConfig(BaseModel):
    host: str
    port: int = 389
    bind_dn: str
    bind_password: str
    base_dn: str = ""

    # TLS. mode: none | ldaps | starttls
    tls_mode: str = "none"
    tls_ca_file: Optional[str] = None
    tls_cert_file: Optional[str] = None
    tls_key_file: Optional[str] = None
    tls_verify: bool = True


class LDAPClient:
    def __init__(self, config: LDAPConfig):
        self.config = config
        self.conn = None

    def _apply_tls_options(self) -> None:
        """
        python-ldap keeps TLS settings in a process-global context, so they are
        set with ldap.set_option and the context rebuilt with OPT_X_TLS_NEWCTX.
        """
        if self.config.tls_ca_file:
            ldap.set_option(ldap.OPT_X_TLS_CACERTFILE, self.config.tls_ca_file)
        if self.config.tls_cert_file:
            ldap.set_option(ldap.OPT_X_TLS_CERTFILE, self.config.tls_cert_file)
        if self.config.tls_key_file:
            ldap.set_option(ldap.OPT_X_TLS_KEYFILE, self.config.tls_key_file)
        ldap.set_option(
            ldap.OPT_X_TLS_REQUIRE_CERT,
            ldap.OPT_X_TLS_DEMAND if self.config.tls_verify else ldap.OPT_X_TLS_NEVER,
        )
        # Must follow any option change: rebuilds the TLS context.
        ldap.set_option(ldap.OPT_X_TLS_NEWCTX, 0)

    def connect(self) -> bool:
        mode = (self.config.tls_mode or "none").lower()
        if mode in ("ldaps", "starttls"):
            with _TLS_LOCK:
                return self._connect(mode)
        return self._connect(mode)

    def _connect(self, mode: str) -> bool:
        try:
            port = self.config.port
            if mode == "ldaps" and port == 389:
                # 389 is the plaintext default; LDAPS conventionally listens on 636.
                logger.info(
                    "tls.mode=ldaps with port 389 - connecting on 636 instead "
                    "(set 'port: 636' explicitly to silence this)"
                )
                port = 636

            if mode in ("ldaps", "starttls"):
                try:
                    self._apply_tls_options()
                except Exception as exc:  # noqa: BLE001 - surface a usable message
                    raise Exception(
                        f"LDAP TLS setup failed (mode '{mode}': {exc}). "
                        "Check that ca_file/cert_file/key_file exist inside the container."
                    )

            scheme = "ldaps" if mode == "ldaps" else "ldap"
            ldap_url = f"{scheme}://{self.config.host}:{port}"
            self.conn = ldap.initialize(ldap_url)

            # Set network and operation timeouts (30 seconds)
            self.conn.set_option(ldap.OPT_NETWORK_TIMEOUT, 30)
            self.conn.set_option(ldap.OPT_TIMEOUT, 30)

            if mode == "starttls":
                self.conn.start_tls_s()

            self.conn.simple_bind_s(self.config.bind_dn, self.config.bind_password)
            
            # Auto-discover base_dn if empty
            if not self.config.base_dn:
                self.config.base_dn = self._discover_base_dn()
            
            return True
        except ldap.LDAPError as e:
            # A certificate rejection surfaces as a bare connection failure, so
            # name the TLS settings that were in play.
            hint = ""
            if mode in ("ldaps", "starttls"):
                parts = [f"TLS mode '{mode}'"]
                parts.append(f"CA {self.config.tls_ca_file}" if self.config.tls_ca_file else "no CA file")
                parts.append("certificate verification ON" if self.config.tls_verify else "verification OFF")
                hint = " [" + ", ".join(parts) + "]"
            raise Exception(f"LDAP connection failed: {str(e)}{hint}")
    
    def _discover_base_dn(self) -> str:
        """Auto-discover base DN from rootDSE"""
        try:
            result = self.conn.search_s("", ldap.SCOPE_BASE, "(objectClass=*)", ["namingContexts"])
            if result and result[0][1].get("namingContexts"):
                return result[0][1]["namingContexts"][0].decode()
            return ""
        except:
            return ""
    
    def disconnect(self):
        if self.conn:
            self.conn.unbind_s()
    
    def search(self, base_dn: str, filter_str: str = "(objectClass=*)", 
               scope: int = ldap.SCOPE_SUBTREE, attrs: Optional[List[str]] = None,
               page_size: int = 0, cookie: bytes = b'') -> Tuple[List[Dict], bytes, int]:
        """Search with optional pagination support.
        Returns: (entries, cookie, total_count)
        If page_size=0, returns all results without pagination.
        """
        try:
            if page_size > 0:
                # Paginated search
                page_ctrl = SimplePagedResultsControl(True, size=page_size, cookie=cookie)
                msgid = self.conn.search_ext(
                    base_dn, scope, filter_str, attrs, serverctrls=[page_ctrl]
                )
                rtype, rdata, rmsgid, serverctrls = self.conn.result3(msgid)
                
                # Extract cookie for next page
                pctrls = [c for c in serverctrls if c.controlType == SimplePagedResultsControl.controlType]
                next_cookie = pctrls[0].cookie if pctrls else b''
                
                # Get total count (only on first page)
                total_count = 0
                if not cookie:
                    count_results = self.conn.search_s(base_dn, scope, filter_str, ['dn'])
                    total_count = len(count_results)
                
                entries = self._process_results(rdata)
                return entries, next_cookie, total_count
            else:
                # Non-paginated search (original behavior)
                results = self.conn.search_s(base_dn, scope, filter_str, attrs)
                entries = self._process_results(results)
                return entries, b'', len(entries)
        except ldap.LDAPError as e:
            raise Exception(f"Search failed: {str(e)}")
    
    def _process_results(self, results: List) -> List[Dict]:
        """Process LDAP search results into dict format"""
        entries = []
        for dn, attrs in results:
            if not dn:
                continue
            entry = {"dn": dn}
            for key, values in attrs.items():
                decoded_values = []
                for v in values:
                    try:
                        decoded_values.append(v.decode('utf-8'))
                    except:
                        decoded_values.append(str(v))
                # Keep as list if multiple values, otherwise single value
                entry[key] = decoded_values
            entries.append(entry)
        return entries
    
    def add(self, dn: str, attributes: Dict) -> bool:
        try:
            ldif = []
            for k, val in attributes.items():
                values = val if isinstance(val, list) else [val]
                encoded_values = []
                for v in values:
                    if isinstance(v, str):
                        encoded_values.append(v.encode())
                    elif isinstance(v, (int, float, bool)):
                        encoded_values.append(str(v).encode())
                    else:
                        encoded_values.append(v)
                ldif.append((k, encoded_values))
            self.conn.add_s(dn, ldif)
            return True
        except ldap.LDAPError as e:
            raise Exception(f"Add failed: {str(e)}")
    
    def modify(self, dn: str, changes: Dict) -> bool:
        try:
            mod_list = []
            for k, val in changes.items():
                values = val if isinstance(val, list) else [val]
                encoded_values = []
                for v in values:
                    if isinstance(v, str):
                        encoded_values.append(v.encode())
                    elif isinstance(v, (int, float, bool)):
                        encoded_values.append(str(v).encode())
                    else:
                        encoded_values.append(v)
                mod_list.append((ldap.MOD_REPLACE, k, encoded_values))
            self.conn.modify_s(dn, mod_list)
            return True
        except ldap.LDAPError as e:
            raise Exception(f"Modify failed: {str(e)}")

    def modify_ops(self, dn: str, ops) -> bool:
        """
        Apply an ordered list of (op, attr, values) modifications, where op is
        'add', 'replace' or 'delete'. Needed for LDIF import, where a single
        record can carry add:/replace:/delete: directives that `modify` (which
        is replace-only) cannot express.
        """
        try:
            op_map = {
                'add': ldap.MOD_ADD,
                'replace': ldap.MOD_REPLACE,
                'delete': ldap.MOD_DELETE,
            }
            mod_list = []
            for op, attr, values in ops:
                if op not in op_map:
                    raise ValueError(f"Unknown modify operation: {op}")
                encoded = []
                for value in values:
                    if isinstance(value, str):
                        encoded.append(value.encode())
                    elif isinstance(value, (int, float, bool)):
                        encoded.append(str(value).encode())
                    else:
                        encoded.append(value)
                # delete with no values removes the whole attribute
                mod_list.append((op_map[op], attr, encoded if (op != 'delete' or encoded) else None))
            self.conn.modify_s(dn, mod_list)
            return True
        except ldap.LDAPError as e:
            raise Exception(f"Modify failed: {str(e)}")
    
    def delete(self, dn: str) -> bool:
        try:
            self.conn.delete_s(dn)
            return True
        except ldap.LDAPError as e:
            raise Exception(f"Delete failed: {str(e)}")
    
    def get_entry_count(self, base_dn: str, filter_str: str = "(objectClass=*)") -> int:
        try:
            results = self.conn.search_s(base_dn, ldap.SCOPE_SUBTREE, filter_str, ["dn"])
            return len(results)
        except ldap.LDAPError:
            return 0

    def get_all_groups(self, base_dn: str) -> List[Dict]:
        """Get all groups in the directory"""
        try:
            filter_str = "(|(objectClass=groupOfNames)(objectClass=groupOfUniqueNames)(objectClass=posixGroup))"
            results = self.conn.search_s(
                base_dn, ldap.SCOPE_SUBTREE, filter_str,
                ['cn', 'description', 'objectClass']
            )
            return self._process_results(results)
        except ldap.LDAPError as e:
            raise Exception(f"Failed to get groups: {str(e)}")

    def get_user_groups(self, user_dn: str, base_dn: str) -> List[Dict]:
        """Find all groups that contain this user DN as a member"""
        try:
            escaped_dn = ldap.filter.escape_filter_chars(user_dn)
            filter_str = f"(|(uniqueMember={escaped_dn})(member={escaped_dn})(memberUid={escaped_dn}))"
            results = self.conn.search_s(
                base_dn, ldap.SCOPE_SUBTREE, filter_str,
                ['cn', 'description', 'objectClass']
            )
            return self._process_results(results)
        except ldap.LDAPError as e:
            raise Exception(f"Failed to get user groups: {str(e)}")

    def add_member_to_group(self, group_dn: str, member_dn: str) -> bool:
        """Add a member DN to a group using MOD_ADD"""
        try:
            mod_list = [(ldap.MOD_ADD, 'uniqueMember', [member_dn.encode()])]
            self.conn.modify_s(group_dn, mod_list)
            return True
        except ldap.TYPE_OR_VALUE_EXISTS:
            return True  # Already a member, consider it success
        except ldap.LDAPError as e:
            raise Exception(f"Failed to add member to group: {str(e)}")

    def remove_member_from_group(self, group_dn: str, member_dn: str) -> bool:
        """Remove a member DN from a group using MOD_DELETE"""
        try:
            mod_list = [(ldap.MOD_DELETE, 'uniqueMember', [member_dn.encode()])]
            self.conn.modify_s(group_dn, mod_list)
            return True
        except ldap.NO_SUCH_ATTRIBUTE:
            return True  # Not a member anyway, consider it success
        except ldap.OBJECT_CLASS_VIOLATION:
            raise Exception("Cannot remove the last member from a groupOfUniqueNames group")
        except ldap.LDAPError as e:
            raise Exception(f"Failed to remove member from group: {str(e)}")
