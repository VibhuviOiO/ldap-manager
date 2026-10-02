"""
Tests for the ACI (olcAccess) editor.
"""

import pytest
import ldap
from fastapi.testclient import TestClient

from app.api.aci import _parse_rule


@pytest.fixture
def client(isolated_store):
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def write_config(store):
    store["config"].write_text(
        "auth:\n  mode: none\n  default_role: admin\n\nclusters:\n"
        "  - name: prod\n    host: ldap.example.com\n    port: 389\n"
        "    bind_dn: cn=admin,dc=example,dc=com\n    base_dn: dc=example,dc=com\n"
        "    config:\n      bind_dn: cn=config\n      credential:\n        source: env\n"
    )


# ------------------------------------------------------------------ parser --


def test_parse_rule_extracts_index_and_text():
    parsed = _parse_rule("{2}to * by dn=\"cn=Manager,dc=x\" write")
    assert parsed["index"] == 2
    assert parsed["rule"] == 'to * by dn="cn=Manager,dc=x" write'


def test_parse_rule_without_index():
    parsed = _parse_rule("to attrs=userPassword by * none")
    assert parsed["index"] is None
    assert parsed["rule"] == "to attrs=userPassword by * none"


# --------------------------------------------------------------- endpoints --


class FakeAciClient:
    def __init__(self):
        self.modifications = []
        self.rules = [
            "{0}to attrs=userPassword by self write by * auth",
            "{1}to * by dn=\"cn=Manager,dc=example,dc=com\" write",
        ]

    def connect(self):
        pass

    def disconnect(self):
        pass

    @property
    def conn(self):
        return self

    def modify_s(self, dn, modlist):
        self.modifications.append((dn, modlist))

    def search(self, base, filter_str, scope=None, attrs=None, **kwargs):
        if base == "cn=config":
            return (
                [
                    {
                        "dn": "olcDatabase={2}mdb,cn=config",
                        "olcDatabase": ["{2}mdb"],
                        "olcSuffix": ["dc=example,dc=com"],
                        "olcAccess": list(self.rules),
                    }
                ],
                b"", 1,
            )
        # base search on a database dn
        return (
            [{"dn": base, "olcAccess": list(self.rules)}],
            b"", 1,
        )


def patch_aci(monkeypatch, fake):
    from app.api import aci as mod

    monkeypatch.setattr(mod, "config_is_configured", lambda c: True)
    monkeypatch.setattr(mod, "resolve_config_password", lambda c: "secret")
    monkeypatch.setattr(mod, "LDAPClient", lambda config: fake)
    monkeypatch.setattr(
        mod, "NodeSelector",
        type("NS", (), {"select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))}),
    )


def test_get_acis_lists_databases_and_rules(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    patch_aci(monkeypatch, FakeAciClient())

    response = client.get("/api/aci/prod")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["rule_count"] == 2
    database = body["databases"][0]
    assert database["dn"] == "olcDatabase={2}mdb,cn=config"
    assert database["suffix"] == "dc=example,dc=com"
    assert [r["index"] for r in database["access"]] == [0, 1]


def test_add_rule_appends(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = FakeAciClient()
    patch_aci(monkeypatch, fake)

    response = client.post("/api/aci/prod/access", json={
        "database_dn": "olcDatabase={2}mdb,cn=config",
        "rule": "to * by * read",
    })
    assert response.status_code == 200, response.text
    dn, modlist = fake.modifications[0]
    assert modlist[0][0] == ldap.MOD_ADD
    assert modlist[0][1] == "olcAccess"
    assert modlist[0][2] == [b"to * by * read"]


def test_add_rule_at_position_prefixes_index(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = FakeAciClient()
    patch_aci(monkeypatch, fake)

    response = client.post("/api/aci/prod/access", json={
        "database_dn": "olcDatabase={2}mdb,cn=config",
        "rule": "to * by * read",
        "position": 0,
    })
    assert response.status_code == 200
    assert fake.modifications[0][1][0][2] == [b"{0}to * by * read"]


def test_add_rule_rejects_malformed(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = FakeAciClient()
    patch_aci(monkeypatch, fake)

    for bad in ["", "by * read", "to *"]:
        response = client.post("/api/aci/prod/access", json={
            "database_dn": "olcDatabase={2}mdb,cn=config", "rule": bad,
        })
        assert response.status_code == 400, f"expected 400 for {bad!r}"
    assert fake.modifications == []


def test_remove_rule_by_index(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = FakeAciClient()
    patch_aci(monkeypatch, fake)

    response = client.delete(
        "/api/aci/prod/access",
        params={"database_dn": "olcDatabase={2}mdb,cn=config", "index": 1},
    )
    assert response.status_code == 200, response.text
    dn, modlist = fake.modifications[0]
    assert modlist[0][0] == ldap.MOD_DELETE
    # the exact stored value (with its {1} prefix) must be deleted
    assert modlist[0][2] == [b'{1}to * by dn="cn=Manager,dc=example,dc=com" write']


def test_remove_unknown_index_is_404(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    patch_aci(monkeypatch, FakeAciClient())

    response = client.delete(
        "/api/aci/prod/access",
        params={"database_dn": "olcDatabase={2}mdb,cn=config", "index": 99},
    )
    assert response.status_code == 404


def test_aci_write_requires_admin(client, isolated_store):
    isolated_store["config"].write_text(
        "auth:\n  mode: none\n  default_role: readonly\n\nclusters:\n"
        "  - name: prod\n    host: h.example.com\n    bind_dn: cn=admin,dc=x\n"
    )
    response = client.post("/api/aci/prod/access", json={
        "database_dn": "olcDatabase={2}mdb,cn=config", "rule": "to * by * read",
    })
    assert response.status_code == 403
