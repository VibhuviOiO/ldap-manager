"""
Tests for the DIT tree endpoints: /api/entries/children and /api/entries/get.
"""

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(isolated_store):
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def write_config(store, clusters_yaml):
    store["config"].write_text(
        "auth:\n  mode: none\n  default_role: admin\n\nclusters:\n" + clusters_yaml
    )


CONFIG = """
  - name: prod
    host: ldap.example.com
    port: 389
    bind_dn: cn=admin,dc=example,dc=com
    base_dn: dc=example,dc=com
"""


class FakeClient:
    """Stub for LDAPClient. children rows are (dn, objectClass)."""

    def __init__(self, config):
        self.config = config
        self.searches = []

    def connect(self):
        pass

    def disconnect(self):
        pass

    def search(self, base, filter_str, scope=None, attrs=None, **kwargs):
        self.searches.append((base, scope, attrs))
        if scope == 0:  # ldap.SCOPE_BASE
            return (
                [{"dn": base, "objectClass": ["top", "inetOrgPerson"], "uid": ["alice"], "cn": ["Alice"]}],
                b"",
                1,
            )
        return (
            [
                {"dn": f"uid=bob,{base}", "objectClass": ["inetOrgPerson", "posixAccount"]},
                {"dn": f"ou=People,{base}", "objectClass": ["organizationalUnit"]},
                {"dn": f"cn=Admins,{base}", "objectClass": ["groupOfUniqueNames"]},
            ],
            b"",
            3,
        )


def test_children_returns_typed_and_sorted_children(client, isolated_store, monkeypatch):
    write_config(isolated_store, CONFIG)

    import ldap
    from app.api import entries

    monkeypatch.setattr(entries, "resolve_password", lambda c: "secret")
    monkeypatch.setattr(entries, "LDAPClient", FakeClient)
    monkeypatch.setattr(entries, "NodeSelector", type("NS", (), {
        "select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))
    }))

    response = client.get("/api/entries/children?cluster=prod")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["base_dn"] == "dc=example,dc=com"
    assert [c["rdn"] for c in body["children"]] == ["ou=People", "cn=Admins", "uid=bob"]

    people = next(c for c in body["children"] if c["rdn"] == "ou=People")
    assert people["is_ou"] is True

    admins = next(c for c in body["children"] if c["rdn"] == "cn=Admins")
    assert admins["is_group"] is True

    bob = next(c for c in body["children"] if c["rdn"] == "uid=bob")
    assert bob["is_user"] is True


def test_children_uses_a_scope_base_under_the_given_base(client, isolated_store, monkeypatch):
    write_config(isolated_store, CONFIG)
    import ldap
    from app.api import entries

    fake = FakeClient(None)
    monkeypatch.setattr(entries, "resolve_password", lambda c: "secret")
    monkeypatch.setattr(entries, "LDAPClient", lambda config: fake)
    monkeypatch.setattr(entries, "NodeSelector", type("NS", (), {
        "select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))
    }))

    client.get("/api/entries/children?cluster=prod&base_dn=ou=People,dc=example,dc=com")
    base, scope, _attrs = fake.searches[0]
    assert base == "ou=People,dc=example,dc=com"
    assert scope == 1  # ldap.SCOPE_ONELEVEL


def test_children_requires_a_credential(client, isolated_store, monkeypatch):
    write_config(isolated_store, CONFIG)
    from app.api import entries

    monkeypatch.setattr(entries, "resolve_password", lambda c: None)
    response = client.get("/api/entries/children?cluster=prod")
    assert response.status_code == 401


def test_children_unknown_cluster_is_404(client, isolated_store, monkeypatch):
    write_config(isolated_store, CONFIG)
    from app.api import entries

    monkeypatch.setattr(entries, "resolve_password", lambda c: "secret")
    response = client.get("/api/entries/children?cluster=ghost")
    assert response.status_code == 404


def test_get_returns_entry_attributes(client, isolated_store, monkeypatch):
    write_config(isolated_store, CONFIG)
    from app.api import entries

    monkeypatch.setattr(entries, "resolve_password", lambda c: "secret")
    monkeypatch.setattr(entries, "LDAPClient", FakeClient)
    monkeypatch.setattr(entries, "NodeSelector", type("NS", (), {
        "select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))
    }))

    response = client.get("/api/entries/get?cluster=prod&dn=uid=alice,dc=example,dc=com")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["dn"] == "uid=alice,dc=example,dc=com"
    assert body["attributes"]["uid"] == ["alice"]
    assert body["attributes"]["cn"] == ["Alice"]


def test_get_unknown_entry_is_404(client, isolated_store, monkeypatch):
    write_config(isolated_store, CONFIG)
    from app.api import entries

    class EmptyClient(FakeClient):
        def search(self, base, filter_str, scope=None, attrs=None, **kwargs):
            return ([], b"", 0)

    monkeypatch.setattr(entries, "resolve_password", lambda c: "secret")
    monkeypatch.setattr(entries, "LDAPClient", EmptyClient)
    monkeypatch.setattr(entries, "NodeSelector", type("NS", (), {
        "select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))
    }))

    response = client.get("/api/entries/get?cluster=prod&dn=uid=ghost,dc=example,dc=com")
    assert response.status_code == 404


def test_get_omits_sensitive_attributes(client, isolated_store, monkeypatch):
    """userPassword hashes must never reach the browser from the browse path."""
    write_config(isolated_store, CONFIG)
    from app.api import entries

    class SensitiveClient(FakeClient):
        def search(self, base, filter_str, scope=None, attrs=None, **kwargs):
            return (
                [{"dn": base, "objectClass": ["top"], "uid": ["a"], "userPassword": ["{SSHA}secret"]}],
                b"",
                1,
            )

    monkeypatch.setattr(entries, "resolve_password", lambda c: "secret")
    monkeypatch.setattr(entries, "LDAPClient", SensitiveClient)
    monkeypatch.setattr(entries, "NodeSelector", type("NS", (), {
        "select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))
    }))

    body = client.get("/api/entries/get?cluster=prod&dn=uid=a,dc=example,dc=com").json()
    assert "userPassword" not in body["attributes"]
    assert "{SSHA}" not in str(body)
    assert body["attributes"]["uid"] == ["a"]
