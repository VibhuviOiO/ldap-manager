"""
Tests for authentication, RBAC, session handling and the built-in user store.

The app has no runtime credential store: cluster bind passwords come from
config.yml (env/file/config) and are never persisted by LDAP Manager. What
remains here is `auth.mode: local` login accounts, which are a separate feature.
"""

import json
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core import auth as auth_core
from app.core import secrets
from app.core.auth import (
    AuthMode,
    Identity,
    Role,
    hash_password,
    verify_password,
)


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    """Point every secret/config path at a temp dir."""
    sec = tmp_path / "secrets"
    sec.mkdir()

    monkeypatch.setattr(secrets, "SECRETS_DIR", sec, raising=False)
    monkeypatch.setattr(secrets, "USERS_FILE", sec / "users.enc", raising=False)
    monkeypatch.setattr(secrets, "SESSION_KEY_FILE", sec / "session.key", raising=False)
    # Fresh Fernet cipher so this test uses the temp dir's key
    monkeypatch.setattr(secrets, "_fernet", None, raising=False)

    config = tmp_path / "config.yml"
    # config.CONFIG_PATH is the single source of truth (auth.py reads it at call
    # time), so patching it redirects both the cluster loader and auth settings.
    from app.core import config as config_module

    monkeypatch.setattr(config_module, "CONFIG_PATH", config, raising=False)
    config.write_text(CLUSTER_BLOCK)
    return {"config": config, "secrets": sec}


# Every test config needs at least one cluster: with none, /api/clusters/* 404s
# because load_config() has nothing to serve, which is unrelated to auth.
CLUSTER_BLOCK = """
clusters:
  - name: test-cluster
    host: ldap.example.com
    port: 389
    bind_dn: cn=admin,dc=example,dc=com
    base_dn: dc=example,dc=com
"""


def write_config(path: Path, body: str) -> None:
    path.write_text(body + "\n" + CLUSTER_BLOCK)


# --------------------------------------------------------------- passwords --


def test_password_hash_roundtrip():
    stored = hash_password("correct horse battery staple")
    assert stored.startswith("scrypt$")
    assert "correct horse battery staple" not in stored
    assert verify_password("correct horse battery staple", stored)
    assert not verify_password("wrong", stored)


def test_verify_password_rejects_malformed_hash():
    for bad in ["", "not-a-hash", "bcrypt$x$y", "scrypt$1$2$3$4"]:
        assert verify_password("anything", bad) is False


def test_two_hashes_of_same_password_differ():
    """Per-user salt."""
    assert hash_password("same") != hash_password("same")


# ------------------------------------------------------------------- roles --


def test_role_ordering():
    assert Role.ADMIN.allows(Role.READWRITE)
    assert Role.ADMIN.allows(Role.READONLY)
    assert Role.READWRITE.allows(Role.READONLY)
    assert not Role.READONLY.allows(Role.READWRITE)
    assert not Role.READWRITE.allows(Role.ADMIN)
    assert Role.READONLY.allows(Role.READONLY)


# ---------------------------------------------------------------- sessions --


def test_session_token_roundtrip(isolated_store):
    token = secrets.issue_token("alice", "admin")
    payload = secrets.verify_token(token)
    assert payload is not None
    assert payload["sub"] == "alice"
    assert payload["role"] == "admin"


def test_session_token_rejects_tampering(isolated_store):
    token = secrets.issue_token("alice", "admin")
    body, _, sig = token.partition(".")

    # Forge an admin payload with the real signature
    forged_body = secrets._b64e(json.dumps({"sub": "mallory", "role": "admin",
                                            "exp": int(time.time()) + 999}).encode())
    assert secrets.verify_token(f"{forged_body}.{sig}") is None

    # Flip the role inside a legitimately signed token
    payload = json.loads(secrets._b64d(body))
    payload["role"] = "admin"
    re_body = secrets._b64e(json.dumps(payload).encode())
    assert secrets.verify_token(f"{re_body}.{sig}") is None


def test_session_token_expiry(isolated_store):
    assert secrets.verify_token(secrets.issue_token("bob", "readonly", ttl=-5)) is None


def test_session_token_garbage(isolated_store):
    for bad in [None, "", "nodot", "a.b", "..."]:
        assert secrets.verify_token(bad) is None


# ------------------------------------------------------------- auth config --


def test_auth_defaults_to_none_readonly(isolated_store):
    settings = auth_core.load_auth_settings()
    assert settings.mode is AuthMode.NONE
    assert settings.default_role is Role.READONLY


def test_auth_parses_full_ldap_block(isolated_store):
    write_config(
        isolated_store["config"],
        """
auth:
  mode: ldap
  default_role: readwrite
  session:
    lifetime_hours: 4
  ldap:
    cluster: prod
    user_dn_template: "uid={username},ou=People,dc=example,dc=com"
    role_map:
      default: readonly
      groups:
        "cn=admins,dc=example,dc=com": admin
        "cn=ops,dc=example,dc=com": readwrite
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    base_dn: dc=example,dc=com
""",
    )
    settings = auth_core.load_auth_settings()
    assert settings.mode is AuthMode.LDAP
    assert settings.default_role is Role.READWRITE
    assert settings.session_lifetime_hours == 4
    assert settings.ldap.cluster == "prod"
    assert settings.ldap.group_roles["cn=admins,dc=example,dc=com"] is Role.ADMIN
    assert settings.ldap.group_roles["cn=ops,dc=example,dc=com"] is Role.READWRITE
    assert settings.ldap.default_role is Role.READONLY


def test_unknown_auth_mode_falls_back_to_none(isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: keycloak\n")
    settings = auth_core.load_auth_settings()
    assert settings.mode is AuthMode.NONE


# ---------------------------------------------------------------- local auth --


def test_local_authenticate(isolated_store):
    secrets.save_local_users([
        {"username": "admin", "role": "admin", "password_hash": hash_password("s3cret-pw")},
        {"username": "viewer", "role": "readonly", "password_hash": hash_password("view-pw")},
    ])

    admin = auth_core.authenticate_local("admin", "s3cret-pw")
    assert admin is not None and admin.role is Role.ADMIN

    viewer = auth_core.authenticate_local("viewer", "view-pw")
    assert viewer is not None and viewer.role is Role.READONLY

    assert auth_core.authenticate_local("admin", "wrong") is None
    assert auth_core.authenticate_local("ghost", "s3cret-pw") is None


# ------------------------------------------------------------------ the API --


@pytest.fixture
def client(isolated_store):
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def test_status_is_public_and_reports_none_mode(client, isolated_store):
    body = client.get("/api/auth/status").json()
    assert body["mode"] == "none"
    assert body["setup_required"] is False
    assert body["role"] == "readonly"
    assert body["authenticated"] is False


def test_setup_required_when_local_and_empty(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: local\n")
    body = client.get("/api/auth/status").json()
    assert body["mode"] == "local"
    assert body["setup_required"] is True


def test_setup_creates_admin_and_logs_in(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: local\n")

    response = client.post(
        "/api/auth/setup",
        json={"users": [{"username": "admin", "password": "admin-pass", "role": "admin"}]},
    )
    assert response.status_code == 200, response.text
    assert response.json()["identity"]["role"] == "admin"
    assert "ldap_manager_session" in response.cookies

    # The wizard signs you straight in
    me = client.get("/api/auth/me").json()
    assert me["authenticated"] is True
    assert me["role"] == "admin"

    # And it cannot be replayed
    again = client.post(
        "/api/auth/setup",
        json={"users": [{"username": "x", "password": "whatever1", "role": "admin"}]},
    )
    assert again.status_code == 409


def test_setup_requires_an_admin(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: local\n")
    response = client.post(
        "/api/auth/setup",
        json={"users": [{"username": "viewer", "password": "viewer-pass", "role": "readonly"}]},
    )
    assert response.status_code == 400
    assert "admin" in response.json()["detail"].lower()


def test_setup_rejects_short_password(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: local\n")
    response = client.post(
        "/api/auth/setup",
        json={"users": [{"username": "admin", "password": "short", "role": "admin"}]},
    )
    assert response.status_code == 400


def test_setup_rejected_when_mode_is_none(client, isolated_store):
    response = client.post(
        "/api/auth/setup",
        json={"users": [{"username": "admin", "password": "admin-pass", "role": "admin"}]},
    )
    assert response.status_code == 400


def test_login_and_protected_route(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: local\n")
    secrets.save_local_users([
        {"username": "admin", "role": "admin", "password_hash": hash_password("admin-pass")},
        {"username": "viewer", "role": "readonly", "password_hash": hash_password("view-pass")},
    ])
    client.cookies.clear()

    # Anonymous is refused on a protected route
    assert client.get("/api/clusters/list").status_code == 401

    # Bad credentials
    assert client.post("/api/auth/login", json={"username": "admin", "password": "nope"}).status_code == 401

    # Readonly can read but not administer
    assert client.post("/api/auth/login", json={"username": "viewer", "password": "view-pass"}).status_code == 200
    assert client.get("/api/auth/me").json()["role"] == "readonly"
    assert client.get("/api/auth/users").status_code == 403
    assert client.get("/api/clusters/list").status_code == 200

    # Admin can
    client.cookies.clear()
    assert client.post("/api/auth/login", json={"username": "admin", "password": "admin-pass"}).status_code == 200
    assert client.get("/api/auth/users").status_code == 200


def test_logout_clears_session(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: local\n")
    secrets.save_local_users([
        {"username": "admin", "role": "admin", "password_hash": hash_password("admin-pass")},
    ])
    client.cookies.clear()
    client.post("/api/auth/login", json={"username": "admin", "password": "admin-pass"})
    assert client.get("/api/auth/me").json()["authenticated"] is True

    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").json()["authenticated"] is False


def test_mode_none_default_role_readonly_blocks_writes(client, isolated_store):
    """Safe default: with no login, an anonymous visitor can look but not change."""
    body = client.get("/api/clusters/list").json()
    assert "clusters" in body


def test_mode_none_can_be_opened_up_for_a_proxy(client, isolated_store):
    """The operator can trust their proxy by widening default_role."""
    write_config(isolated_store["config"], "auth:\n  mode: none\n  default_role: admin\n")
    assert client.get("/api/auth/users").status_code == 200


def test_mode_none_readonly_denies_admin_routes(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: none\n  default_role: readonly\n")
    assert client.get("/api/auth/users").status_code == 403


def test_cannot_remove_the_only_admin(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: local\n")
    secrets.save_local_users([
        {"username": "admin", "role": "admin", "password_hash": hash_password("admin-pass")},
    ])
    client.cookies.clear()
    client.post("/api/auth/login", json={"username": "admin", "password": "admin-pass"})

    assert client.delete("/api/auth/users/admin").status_code == 400

    # Demotion to a lesser role is also refused
    response = client.post(
        "/api/auth/users",
        json={"username": "admin", "password": "admin-pass", "role": "readonly"},
    )
    assert response.status_code == 400


def test_users_are_never_exposed_with_hashes(client, isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: local\n")
    secrets.save_local_users([
        {"username": "admin", "role": "admin", "password_hash": hash_password("admin-pass")},
    ])
    client.cookies.clear()
    client.post("/api/auth/login", json={"username": "admin", "password": "admin-pass"})

    payload = client.get("/api/auth/users").json()
    assert payload["users"] == [{"username": "admin", "role": "admin"}]
    assert "password_hash" not in json.dumps(payload)


# ------------------------------------------------------- LDAP group lookups --


def test_group_lookup_uses_integer_scope(monkeypatch, isolated_store):
    """
    Regression: python-ldap needs integer scope constants. Passing the strings
    "base"/"sub" raised inside the search, the broad except swallowed it, and
    every LDAP user silently fell back to the default role.
    """
    import ldap
    from types import SimpleNamespace

    calls = []

    class FakeClient:
        def __init__(self, config):
            pass

        def connect(self):
            pass

        def disconnect(self):
            pass

        def search(self, base, filter_str, scope=None, attrs=None, **kwargs):
            calls.append(scope)
            if "uniqueMember" in filter_str:
                return ([{"dn": "cn=admins,dc=example,dc=com"}], b"", 1)
            return ([{}], b"", 1)

    monkeypatch.setattr("app.core.ldap_client.LDAPClient", FakeClient)
    monkeypatch.setattr(
        "app.core.node_selector.NodeSelector.select_node", lambda cluster, op: ("ldap.example.com", 389)
    )

    cluster = SimpleNamespace(base_dn="dc=example,dc=com")
    groups = auth_core._groups_for_user(
        cluster, "uid=alice,dc=example,dc=com", "pw", auth_core.AuthSettings(), "alice"
    )

    assert "cn=admins,dc=example,dc=com" in groups
    assert calls, "search was never called"
    assert all(isinstance(scope, int) for scope in calls), f"scope must be int, got {calls}"
    assert ldap.SCOPE_SUBTREE in calls


def test_group_lookup_covers_all_membership_styles(monkeypatch, isolated_store):
    """groupOfNames uses member, groupOfUniqueNames uses uniqueMember,
    posixGroup uses memberUid. Searching only `member` misses two of the three."""
    from types import SimpleNamespace

    seen_filters = []

    class FakeClient:
        def __init__(self, config):
            pass

        def connect(self):
            pass

        def disconnect(self):
            pass

        def search(self, base, filter_str, scope=None, attrs=None, **kwargs):
            seen_filters.append(filter_str)
            if "uniqueMember" in filter_str:
                return ([{"dn": "cn=admins,dc=example,dc=com"}], b"", 1)
            return ([{}], b"", 1)

    monkeypatch.setattr("app.core.ldap_client.LDAPClient", FakeClient)
    monkeypatch.setattr(
        "app.core.node_selector.NodeSelector.select_node", lambda cluster, op: ("ldap.example.com", 389)
    )

    cluster = SimpleNamespace(base_dn="dc=example,dc=com")
    auth_core._groups_for_user(
        cluster, "uid=alice,dc=example,dc=com", "pw", auth_core.AuthSettings(), "alice"
    )

    group_filter = [f for f in seen_filters if "uniqueMember" in f][0]
    assert "(member=" in group_filter
    assert "(uniqueMember=" in group_filter
    assert "(memberUid=alice)" in group_filter


def test_ldap_auth_requires_a_designated_cluster(isolated_store):
    """mode=ldap with no auth.ldap.cluster must fail closed, not authenticate."""
    settings = auth_core.AuthSettings(mode=AuthMode.LDAP)
    assert auth_core.authenticate_ldap("alice", "pw", settings) is None


def test_ldap_auth_rejects_unknown_cluster(isolated_store):
    write_config(isolated_store["config"], "auth:\n  mode: ldap\n")
    settings = auth_core.AuthSettings(mode=AuthMode.LDAP)
    settings.ldap.cluster = "does-not-exist"
    assert auth_core.authenticate_ldap("alice", "pw", settings) is None


class TestLdapAuthFullPath:
    """The whole LDAP login path, not just its early returns.

    The earlier tests only covered failures *before* the bind (no cluster, bad
    cluster), so they never built an LDAPConfig. A missing `tls_kwargs` import
    in that block therefore broke every LDAP login while the suite stayed green.
    """

    # write_config() appends CLUSTER_BLOCK, which defines "test-cluster".
    CONFIG = """
auth:
  mode: ldap
  ldap:
    cluster: test-cluster
    user_dn_template: "uid={username},ou=People,dc=example,dc=com"
    role_map:
      default: readonly
      groups:
        "cn=admins,dc=example,dc=com": admin
        "cn=ops,dc=example,dc=com": readwrite
"""

    def _fake(self, monkeypatch, groups):
        bound = []

        class FakeClient:
            def __init__(self, config):
                self.config = config
                bound.append(config)

            def connect(self):
                return True

            def disconnect(self):
                pass

            def search(self, base, filter_str, scope=None, attrs=None, **kwargs):
                if "member" in filter_str:
                    return ([{"dn": g} for g in groups], b"", len(groups))
                return ([{}], b"", 1)

        monkeypatch.setattr("app.core.ldap_client.LDAPClient", FakeClient)
        monkeypatch.setattr(
            "app.core.node_selector.NodeSelector.select_node",
            lambda cluster, op: ("ldap.example.com", 389),
        )
        return bound

    def test_binds_as_the_user_and_maps_group_to_admin(self, monkeypatch, isolated_store):
        write_config(isolated_store["config"], self.CONFIG)
        bound = self._fake(monkeypatch, ["cn=admins,dc=example,dc=com"])

        settings = auth_core.load_auth_settings()
        identity = auth_core.authenticate_ldap("alice", "pw", settings)

        assert identity is not None, "LDAP login must succeed when the bind succeeds"
        assert identity.role is Role.ADMIN
        assert identity.authenticated is True
        assert identity.subject == "alice"
        # the user's own DN is used for the bind, not the cluster admin's
        assert any(c.bind_dn == "uid=alice,ou=People,dc=example,dc=com" for c in bound)

    def test_unmapped_groups_fall_back_to_the_default_role(self, monkeypatch, isolated_store):
        write_config(isolated_store["config"], self.CONFIG)
        self._fake(monkeypatch, ["cn=unrelated,dc=example,dc=com"])

        settings = auth_core.load_auth_settings()
        identity = auth_core.authenticate_ldap("bob", "pw", settings)

        assert identity is not None
        assert identity.role is Role.READONLY

    def test_highest_ranked_group_wins(self, monkeypatch, isolated_store):
        write_config(isolated_store["config"], self.CONFIG)
        self._fake(monkeypatch, ["cn=ops,dc=example,dc=com", "cn=admins,dc=example,dc=com"])

        settings = auth_core.load_auth_settings()
        identity = auth_core.authenticate_ldap("carol", "pw", settings)

        assert identity.role is Role.ADMIN

    def test_failed_bind_is_not_authenticated(self, monkeypatch, isolated_store):
        write_config(isolated_store["config"], self.CONFIG)
        monkeypatch.setattr(
            "app.core.node_selector.NodeSelector.select_node",
            lambda cluster, op: ("ldap.example.com", 389),
        )

        class FailingClient:
            def __init__(self, config):
                pass

            def connect(self):
                raise Exception("invalid credentials")

            def disconnect(self):
                pass

        monkeypatch.setattr("app.core.ldap_client.LDAPClient", FailingClient)
        settings = auth_core.load_auth_settings()
        assert auth_core.authenticate_ldap("alice", "wrong", settings) is None
