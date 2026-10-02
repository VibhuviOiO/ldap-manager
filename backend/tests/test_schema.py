"""
Tests for the schema browser (cn=schema attribute types and object classes).
"""

import pytest
import ldap
from fastapi.testclient import TestClient

from app.api.schema import _parse_definition, _clean_name


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


def test_parse_attribute_type_definition():
    parsed = _parse_definition(
        "( 1.3.6.1.4.1.99999.1.1 NAME 'kingdom' DESC 'Mahabharata kingdom' "
        "EQUALITY caseIgnoreMatch SUBSTR caseIgnoreSubstringsMatch "
        "SYNTAX 1.3.6.1.4.1.1466.115.121.1.15 )"
    )
    assert parsed["oid"] == "1.3.6.1.4.1.99999.1.1"
    assert parsed["name"] == "kingdom"
    assert parsed["equality"] == "caseIgnoreMatch"
    assert parsed["syntax"] == "1.3.6.1.4.1.1466.115.121.1.15"
    assert parsed["single_value"] is False


def test_parse_object_class_definition():
    parsed = _parse_definition(
        "( 1.3.6.1.4.1.99999.2.1 NAME 'MahabharataUser' SUP inetOrgPerson STRUCTURAL "
        "MUST ( kingdom $ role $ allegiance $ isWarrior $ isAdmin ) MAY ( weapon ) )"
    )
    assert parsed["name"] == "MahabharataUser"
    assert parsed["sup"] == "inetOrgPerson"


def test_parse_single_value():
    parsed = _parse_definition("( 1.2.3 NAME 'uid' SINGLE-VALUE )")
    assert parsed["single_value"] is True


def test_clean_name_strips_ordering_prefix():
    assert _clean_name("cn={4}MahabharataCharacter,cn=schema,cn=config", "cn={4}MahabharataCharacter") == "MahabharataCharacter"


# --------------------------------------------------------------- endpoint --


class FakeSchemaClient:
    def __init__(self, config):
        self.config = config

    def connect(self):
        pass

    def disconnect(self):
        pass

    def search(self, base, filter_str, scope=None, attrs=None, **kwargs):
        return (
            [
                {
                    "dn": "cn={0}core,cn=schema,cn=config",
                    "cn": ["cn={0}core"],
                    "olcAttributeTypes": ["( 2.5.4.3 NAME 'cn' )"],
                    "olcObjectClasses": ["( 2.5.6.6 NAME 'person' SUP top STRUCTURAL )"],
                },
                {
                    "dn": "cn={4}MahabharataCharacter,cn=schema,cn=config",
                    "cn": ["cn={4}MahabharataCharacter"],
                    "olcAttributeTypes": ["( 1.3.6.1.4.1.99999.1.1 NAME 'kingdom' )"],
                    "olcObjectClasses": ["( 1.3.6.1.4.1.99999.2.1 NAME 'MahabharataUser' SUP inetOrgPerson )"],
                },
            ],
            b"",
            2,
        )


def patch_schema(monkeypatch):
    from app.api import schema as mod

    monkeypatch.setattr(mod, "config_is_configured", lambda c: True)
    monkeypatch.setattr(mod, "resolve_config_password", lambda c: "secret")
    monkeypatch.setattr(mod, "LDAPClient", FakeSchemaClient)
    monkeypatch.setattr(
        mod, "NodeSelector",
        type("NS", (), {"select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))}),
    )


def test_schema_lists_schemas_and_counts(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    patch_schema(monkeypatch)

    response = client.get("/api/schema/prod")
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["counts"] == {"schemas": 2, "attribute_types": 2, "object_classes": 2}
    names = [s["name"] for s in body["schemas"]]
    assert "core" in names
    assert "MahabharataCharacter" in names

    maha = next(s for s in body["schemas"] if s["name"] == "MahabharataCharacter")
    assert maha["attribute_types"][0]["name"] == "kingdom"
    assert maha["object_classes"][0]["name"] == "MahabharataUser"


def test_schema_without_config_credential_is_400(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    from app.api import schema as mod

    monkeypatch.setattr(mod, "config_is_configured", lambda c: False)
    response = client.get("/api/schema/prod")
    assert response.status_code == 400
    assert "cn=config" in response.json()["detail"]


def test_schema_unknown_cluster_is_404(client, isolated_store):
    write_config(isolated_store)
    assert client.get("/api/schema/ghost").status_code == 404


# ----------------------------------------------------------- schema writes --


class WritableSchemaClient:
    """Stub with a modifiable cn=schema and a recordable conn.modify_s."""

    def __init__(self):
        self.modifications = []
        self.attribute_types = ["( 2.5.4.3 NAME 'cn' )"]
        self.object_classes = ["( 2.5.6.6 NAME 'person' SUP top STRUCTURAL )"]

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
        if scope == 1:  # listing schemas
            return (
                [{"dn": "cn={4}MahabharataCharacter,cn=schema,cn=config", "cn": ["cn={4}MahabharataCharacter"]}],
                b"", 1,
            )
        # base scope: return the schema entry's definitions
        attr = attrs[0] if attrs else "olcAttributeTypes"
        values = self.attribute_types if "AttributeTypes" in attr else self.object_classes
        return ([{"dn": base, attr: values}], b"", 1)


def patch_writable(monkeypatch, fake):
    from app.api import schema as mod

    monkeypatch.setattr(mod, "config_is_configured", lambda c: True)
    monkeypatch.setattr(mod, "resolve_config_password", lambda c: "secret")
    monkeypatch.setattr(mod, "LDAPClient", lambda config: fake)
    monkeypatch.setattr(
        mod, "NodeSelector",
        type("NS", (), {"select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))}),
    )


def test_add_attribute_type(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = WritableSchemaClient()
    patch_writable(monkeypatch, fake)

    response = client.post("/api/schema/prod/definitions", json={
        "schema_name": "MahabharataCharacter",
        "kind": "attribute_type",
        "definition": "( 1.3.6.1.4.1.99999.1.99 NAME 'foo' EQUALITY caseIgnoreMatch )",
    })
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "foo"
    dn, modlist = fake.modifications[0]
    assert modlist[0][0] == ldap.MOD_ADD
    assert modlist[0][1] == "olcAttributeTypes"


def test_add_rejects_definition_without_oid_or_name(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = WritableSchemaClient()
    patch_writable(monkeypatch, fake)

    response = client.post("/api/schema/prod/definitions", json={
        "schema_name": "MahabharataCharacter",
        "kind": "attribute_type",
        "definition": "( NAME 'missing-oid' )",
    })
    assert response.status_code == 400
    assert fake.modifications == []


def test_add_rejects_object_class_without_sup(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = WritableSchemaClient()
    patch_writable(monkeypatch, fake)

    response = client.post("/api/schema/prod/definitions", json={
        "schema_name": "MahabharataCharacter",
        "kind": "object_class",
        "definition": "( 1.3.6.1.4.1.99999.2.99 NAME 'NoSup' STRUCTURAL )",
    })
    assert response.status_code == 400


def test_add_rejects_duplicate_name(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = WritableSchemaClient()
    patch_writable(monkeypatch, fake)

    response = client.post("/api/schema/prod/definitions", json={
        "schema_name": "MahabharataCharacter",
        "kind": "attribute_type",
        "definition": "( 9.9.9 NAME 'cn' )",
    })
    assert response.status_code == 409
    assert fake.modifications == []


def test_remove_attribute_type(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = WritableSchemaClient()
    patch_writable(monkeypatch, fake)

    response = client.delete(
        "/api/schema/prod/definitions/cn",
        params={"schema_name": "MahabharataCharacter", "kind": "attribute_type"},
    )
    assert response.status_code == 200, response.text
    dn, modlist = fake.modifications[0]
    assert modlist[0][0] == ldap.MOD_DELETE
    assert modlist[0][2] == ["( 2.5.4.3 NAME 'cn' )".encode()]


def test_remove_unknown_name_is_404(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = WritableSchemaClient()
    patch_writable(monkeypatch, fake)

    response = client.delete(
        "/api/schema/prod/definitions/ghost",
        params={"schema_name": "MahabharataCharacter", "kind": "attribute_type"},
    )
    assert response.status_code == 404


def test_schema_write_requires_admin(client, isolated_store):
    isolated_store["config"].write_text(
        "auth:\n  mode: none\n  default_role: readonly\n\nclusters:\n"
        "  - name: prod\n    host: h.example.com\n    bind_dn: cn=admin,dc=x\n"
    )
    response = client.post("/api/schema/prod/definitions", json={
        "schema_name": "x", "kind": "attribute_type", "definition": "( 1.2.3 NAME 'a' )",
    })
    assert response.status_code == 403
