import ldap
import ldap.controls
import ldap.filter
from ldap.controls import SimplePagedResultsControl
from typing import List, Dict, Optional, Tuple
from pydantic import BaseModel

class LDAPConfig(BaseModel):
    host: str
    port: int = 389
    bind_dn: str
    bind_password: str
    base_dn: str = ""

class LDAPClient:
    def __init__(self, config: LDAPConfig):
        self.config = config
        self.conn = None
    
    def connect(self) -> bool:
        try:
            ldap_url = f"ldap://{self.config.host}:{self.config.port}"
            self.conn = ldap.initialize(ldap_url)
            self.conn.simple_bind_s(self.config.bind_dn, self.config.bind_password)
            
            # Auto-discover base_dn if empty
            if not self.config.base_dn:
                self.config.base_dn = self._discover_base_dn()
            
            return True
        except ldap.LDAPError as e:
            raise Exception(f"LDAP connection failed: {str(e)}")
    
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
