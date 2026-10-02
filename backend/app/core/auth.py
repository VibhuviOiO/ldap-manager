"""
Authentication and roles.

Three selectable modes, set by the operator in config.yml:

    none   no login at all - for deployments where nginx/oauth2-proxy already
           authenticates. Visitors get `default_role` (readonly unless changed).
    local  built-in users created by the first-run wizard. No integration.
    ldap   ONE of the configured clusters authenticates; the remaining clusters
           are just monitored. Users bind with their own DN, and their role comes
           from group membership.

Passwords are hashed with scrypt from the stdlib - no new dependency.
"""

import base64
import hashlib
import hmac
import logging
import os
import secrets as _secrets
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional

import yaml

logger = logging.getLogger(__name__)

MIN_PASSWORD_LENGTH = 8


class Role(str, Enum):
    READONLY = "readonly"
    READWRITE = "readwrite"
    ADMIN = "admin"

    @property
    def rank(self) -> int:
        return {"readonly": 1, "readwrite": 2, "admin": 3}[self.value]

    def allows(self, other: "Role") -> bool:
        """True when this role is at least as privileged as `other`."""
        return self.rank >= other.rank


class AuthMode(str, Enum):
    NONE = "none"
    LOCAL = "local"
    LDAP = "ldap"


@dataclass
class Identity:
    """Who the current request is."""

    subject: str
    role: Role
    authenticated: bool = False
    method: str = "anonymous"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "subject": self.subject,
            "role": self.role.value,
            "authenticated": self.authenticated,
            "method": self.method,
        }


@dataclass
class LdapAuthSettings:
    cluster: str = ""
    user_dn_template: str = ""
    user_base_dn: str = ""
    user_filter: str = "(uid={username})"
    bind_dn_template: str = ""
    # LDAP group DN -> role
    group_roles: Dict[str, Role] = field(default_factory=dict)
    # Role for a user whose groups match nothing above
    default_role: Role = Role.READONLY


@dataclass
class AuthSettings:
    mode: AuthMode = AuthMode.NONE
    default_role: Role = Role.READONLY
    session_lifetime_hours: int = 12
    ldap: LdapAuthSettings = field(default_factory=LdapAuthSettings)


def _as_role(value: Any, fallback: Role) -> Role:
    try:
        return Role(str(value).lower())
    except (ValueError, TypeError):
        logger.warning("Unknown role %r - falling back to %s", value, fallback.value)
        return fallback


def load_auth_settings() -> AuthSettings:
    """
    Read the `auth:` block from config.yml.

    Missing or malformed config is not fatal: the app falls back to
    mode=none/readonly so it still starts and the operator can fix it.
    """
    settings = AuthSettings()
    # Imported here so tests (and LDAP_MANAGER_CONFIG) can redirect the path.
    from app.core.config import CONFIG_PATH

    if not CONFIG_PATH.exists():
        return settings

    try:
        with open(CONFIG_PATH) as handle:
            raw = yaml.safe_load(handle) or {}
    except Exception as exc:  # noqa: BLE001 - a bad auth block must not stop startup
        logger.error("Could not read auth settings: %s", exc)
        return settings

    auth = raw.get("auth") or {}
    if not isinstance(auth, dict):
        logger.error("'auth' must be a mapping - using mode=none")
        return settings

    mode_raw = str(auth.get("mode", "none")).lower()
    try:
        settings.mode = AuthMode(mode_raw)
    except ValueError:
        logger.error("Unknown auth mode %r - using 'none'", mode_raw)
        settings.mode = AuthMode.NONE

    settings.default_role = _as_role(auth.get("default_role", "readonly"), Role.READONLY)

    session = auth.get("session") or {}
    try:
        settings.session_lifetime_hours = int(session.get("lifetime_hours", 12))
    except (TypeError, ValueError):
        pass

    ldap_block = auth.get("ldap") or {}
    if isinstance(ldap_block, dict):
        ld = settings.ldap
        ld.cluster = str(ldap_block.get("cluster", "") or "")
        ld.user_dn_template = str(ldap_block.get("user_dn_template", "") or "")
        ld.user_base_dn = str(ldap_block.get("user_base_dn", "") or "")
        ld.user_filter = str(ldap_block.get("user_filter", "(uid={username})") or "(uid={username})")
        ld.bind_dn_template = str(ldap_block.get("bind_dn_template", "") or "")

        role_map = ldap_block.get("role_map") or {}
        if isinstance(role_map, dict):
            ld.default_role = _as_role(role_map.get("default", "readonly"), Role.READONLY)
            groups = role_map.get("groups") or {}
            if isinstance(groups, dict):
                for dn, role in groups.items():
                    ld.group_roles[str(dn)] = _as_role(role, ld.default_role)

    return settings


# --------------------------------------------------------------- passwords --


def hash_password(password: str) -> str:
    """
    scrypt hash, self-describing so parameters can change later:

        scrypt$<n>$<r>$<p>$<salt_b64>$<hash_b64>
    """
    n, r, p = 2 ** 14, 8, 1
    salt = _secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=n, r=r, p=p, dklen=32)
    return "$".join(
        [
            "scrypt",
            str(n),
            str(r),
            str(p),
            base64.b64encode(salt).decode(),
            base64.b64encode(digest).decode(),
        ]
    )


def verify_password(password: str, stored: str) -> bool:
    """Constant-time verification. Malformed hashes are a mismatch, not a crash."""
    try:
        scheme, n, r, p, salt_b64, hash_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode(),
            salt=base64.b64decode(salt_b64),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(base64.b64decode(hash_b64)),
        )
        return hmac.compare_digest(digest, base64.b64decode(hash_b64))
    except Exception:  # noqa: BLE001
        return False


def validate_new_password(password: str) -> Optional[str]:
    """Returns an error message, or None when acceptable."""
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
    return None


# ------------------------------------------------------------- authenticate --


def authenticate_local(username: str, password: str) -> Optional[Identity]:
    from app.core.secrets import load_local_users

    for user in load_local_users():
        if user.get("username") != username:
            continue
        if verify_password(password, user.get("password_hash", "")):
            return Identity(
                subject=username,
                role=_as_role(user.get("role"), Role.READONLY),
                authenticated=True,
                method="local",
            )
        return None
    return None


def _groups_for_user(
    cluster, user_dn: str, user_password: str, settings: AuthSettings, username: str = ""
) -> List[str]:
    """
    Group DNs for a user.

    Read as the user themselves - their memberOf attribute first, then a search
    for group entries that list them. No service account needed, so LDAP login
    works before any cluster credential has been configured.

    Directory layouts differ, so the search covers all three common styles:
      groupOfNames       -> member
      groupOfUniqueNames -> uniqueMember
      posixGroup         -> memberUid
    Depending on only `member` silently yields the default role on directories
    that use groupOfUniqueNames.
    """
    from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
    from app.core.node_selector import NodeSelector, OperationType
    import ldap as _ldap

    host, port = NodeSelector.select_node(cluster, OperationType.READ)
    client = LDAPClient(
        LDAPConfig(
            host=host,
            port=port,
            bind_dn=user_dn,
            bind_password=user_password,
            base_dn=cluster.base_dn or "",
            **tls_kwargs(cluster),
        )
    )
    try:
        client.connect()
        groups: List[str] = []

        rows, _, _ = client.search(
            user_dn, "(objectClass=*)", scope=_ldap.SCOPE_BASE, attrs=["memberOf"]
        )
        for row in rows:
            value = row.get("memberOf", [])
            groups.extend([value] if isinstance(value, str) else list(value))

        if not groups:
            base = settings.ldap.user_base_dn or cluster.base_dn or ""
            if base:
                clauses = [f"(member={user_dn})", f"(uniqueMember={user_dn})"]
                if username:
                    clauses.append(f"(memberUid={username})")
                rows, _, _ = client.search(
                    base,
                    "(|" + "".join(clauses) + ")",
                    scope=_ldap.SCOPE_SUBTREE,
                    attrs=["dn"],
                )
                for row in rows:
                    dn = row.get("dn") or row.get("DN")
                    if dn:
                        groups.append(dn if isinstance(dn, str) else str(dn))
        return groups
    except Exception as exc:  # noqa: BLE001
        logger.warning("Could not read groups for %s: %s", user_dn, exc)
        return []
    finally:
        try:
            client.disconnect()
        except Exception:  # noqa: BLE001
            pass


def authenticate_ldap(username: str, password: str, settings: AuthSettings) -> Optional[Identity]:
    """
    Bind as the user against the cluster designated as the authenticator.

    The user's own credentials are used for the bind, so no cluster-wide bind
    password is needed to log in.
    """
    from app.core.config import load_config
    from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs
    from app.core.node_selector import NodeSelector, OperationType

    ld = settings.ldap
    if not ld.cluster:
        logger.error("auth.mode is 'ldap' but auth.ldap.cluster is not set")
        return None

    cluster = next((c for c in load_config() if c.name == ld.cluster), None)
    if cluster is None:
        logger.error("auth.ldap.cluster %r is not one of the configured clusters", ld.cluster)
        return None

    if ld.user_dn_template:
        user_dn = ld.user_dn_template.replace("{username}", username)
    else:
        base = ld.user_base_dn or cluster.base_dn or ""
        user_dn = f"uid={username},{base}" if base else ""

    if not user_dn:
        logger.error("Cannot build a user DN - set auth.ldap.user_dn_template")
        return None

    host, port = NodeSelector.select_node(cluster, OperationType.READ)
    probe = LDAPClient(
        LDAPConfig(
            host=host,
            port=port,
            bind_dn=user_dn,
            bind_password=password,
            base_dn=cluster.base_dn or "",
            **tls_kwargs(cluster),
        )
    )
    try:
        probe.connect()
        probe.disconnect()
    except Exception as exc:  # noqa: BLE001 - a failed bind is simply a failed login
        logger.info("LDAP bind failed for %s: %s", user_dn, exc)
        return None

    role = ld.default_role
    if ld.group_roles:
        groups = _groups_for_user(cluster, user_dn, password, settings, username)
        for dn in groups:
            mapped = ld.group_roles.get(dn.strip())
            if mapped and mapped.rank > role.rank:
                role = mapped

    return Identity(subject=username, role=role, authenticated=True, method="ldap")


def authenticate(username: str, password: str) -> Optional[Identity]:
    settings = load_auth_settings()
    if settings.mode is AuthMode.LOCAL:
        return authenticate_local(username, password)
    if settings.mode is AuthMode.LDAP:
        return authenticate_ldap(username, password, settings)
    return None


def anonymous_identity() -> Identity:
    """Who an unauthenticated visitor is, per auth.default_role."""
    settings = load_auth_settings()
    return Identity(
        subject="anonymous",
        role=settings.default_role,
        authenticated=False,
        method="none",
    )
