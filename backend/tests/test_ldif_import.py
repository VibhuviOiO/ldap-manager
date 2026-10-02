"""
Tests for the LDIF parser and import endpoint.
"""

import base64

import pytest
from fastapi.testclient import TestClient

from app.api.ldif import parse_ldif


@pytest.fixture
def client(isolated_store):
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def write_config(store, readonly=False):
    store["config"].write_text(
        "auth:\n  mode: none\n  default_role: admin\n\nclusters:\n"
        "  - name: prod\n    host: ldap.example.com\n    port: 389\n"
        "    bind_dn: cn=admin,dc=example,dc=com\n    base_dn: dc=example,dc=com\n"
        f"    readonly: {str(readonly).lower()}\n"
    )


class FakeClient:
    def __init__(self, config, fail_add=None):
        self.config = config
        self.calls = []
        self.fail_add = fail_add or set()

    def connect(self):
        pass

    def disconnect(self):
        pass

    def add(self, dn, attributes):
        if dn in self.fail_add:
            raise Exception(f"add failed for {dn}")
        self.calls.append(("add", dn, attributes))

    def modify_ops(self, dn, ops):
        self.calls.append(("modify", dn, ops))

    def delete(self, dn):
        self.calls.append(("delete", dn))


# -------------------------------------------------------------- parser --


def test_parse_add_record():
    records = parse_ldif("dn: uid=alice,dc=x\nobjectClass: inetOrgPerson\nuid: alice\ncn: Alice\n")
    assert len(records) == 1
    record = records[0]
    assert record["dn"] == "uid=alice,dc=x"
    assert record["changetype"] == "add"
    assert record["attributes"]["uid"] == ["alice"]
    assert record["attributes"]["cn"] == ["Alice"]
    assert record["attributes"]["objectclass"] == ["inetOrgPerson"]


def test_parse_modify_record():
    ldif = (
        "dn: uid=bob,dc=x\n"
        "changetype: modify\n"
        "replace: mail\n"
        "mail: bob@x.com\n"
        "-\n"
        "add: description\n"
        "description: hello\n"
        "-\n"
    )
    record = parse_ldif(ldif)[0]
    assert record["changetype"] == "modify"
    assert ("replace", "mail", ["bob@x.com"]) in record["mods"]
    assert ("add", "description", ["hello"]) in record["mods"]


def test_parse_delete_record():
    record = parse_ldif("dn: uid=carol,dc=x\nchangetype: delete\n")[0]
    assert record["changetype"] == "delete"
    assert record["dn"] == "uid=carol,dc=x"


def test_parse_multiple_records():
    ldif = "dn: a,dc=x\nobjectClass: top\n\ndn: b,dc=x\nobjectClass: top\n"
    records = parse_ldif(ldif)
    assert [r["dn"] for r in records] == ["a,dc=x", "b,dc=x"]


def test_parse_base64_value_stays_binary():
    encoded = base64.b64encode(b"binary\x00value").decode()
    record = parse_ldif(f"dn: uid=a,dc=x\njpegPhoto:: {encoded}\n")[0]
    assert record["attributes"]["jpegphoto"] == [b"binary\x00value"]


def test_parse_folding_matches_python_ldap():
    # python-ldap unfolds a continuation line by dropping the leading space and
    # NOT adding one back - we match that, so a backup round-trips identically.
    record = parse_ldif("dn: uid=a,dc=x\ndescription: part one\n part two\n")[0]
    assert record["attributes"]["description"] == ["part onepart two"]


def test_parse_ignores_comments_and_blank_lines():
    record = parse_ldif("# header comment\ndn: uid=a,dc=x\ncn: A\n")[0]
    assert record["dn"] == "uid=a,dc=x"
    assert record["attributes"]["cn"] == ["A"]


# ---------------------------------------------------------------- endpoint --


def patch_client(monkeypatch, fake):
    from app.api import ldif as mod

    monkeypatch.setattr(mod, "resolve_password", lambda c: "secret")
    monkeypatch.setattr(mod, "LDAPClient", lambda config: fake)
    monkeypatch.setattr(
        mod, "NodeSelector",
        type("NS", (), {"select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))}),
    )
    return fake


def test_import_add(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None))
    response = client.post("/api/ldif/import", json={
        "cluster_name": "prod",
        "ldif": "dn: uid=a,dc=x\nobjectClass: inetOrgPerson\nuid: a\ncn: A\n",
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["added"] == 1
    assert body["errors"] == []
    assert fake.calls[0][0] == "add"


def test_import_dry_run_does_not_write(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None))
    response = client.post("/api/ldif/import", json={
        "cluster_name": "prod",
        "ldif": "dn: uid=a,dc=x\nobjectClass: top\n",
        "dry_run": True,
    })
    assert response.status_code == 200
    assert response.json()["records"] == 1
    assert fake.calls == []


def test_import_applies_all_changetypes(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None))
    ldif = (
        "dn: uid=a,dc=x\nobjectClass: top\n\n"
        "dn: uid=a,dc=x\nchangetype: modify\nreplace: cn\ncn: New\n-\n\n"
        "dn: uid=gone,dc=x\nchangetype: delete\n"
    )
    response = client.post("/api/ldif/import", json={"cluster_name": "prod", "ldif": ldif})
    body = response.json()
    assert body["status"] == "success"
    assert body["added"] == 1
    assert body["modified"] == 1
    assert body["deleted"] == 1
    kinds = [c[0] for c in fake.calls]
    assert kinds == ["add", "modify", "delete"]


def test_import_reports_partial_failure(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None, fail_add={"uid=b,dc=x"}))
    ldif = "dn: uid=a,dc=x\nobjectClass: top\n\n dn: uid=b,dc=x\nobjectClass: top\n"
    response = client.post("/api/ldif/import", json={"cluster_name": "prod", "ldif": ldif})
    body = response.json()
    assert body["status"] == "partial"
    assert body["added"] == 1
    assert len(body["errors"]) == 1


def test_import_empty_is_400(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    patch_client(monkeypatch, FakeClient(None))
    assert client.post("/api/ldif/import", json={"cluster_name": "prod", "ldif": ""}).status_code == 400


def test_import_requires_admin(client, isolated_store):
    """readwrite is not enough: one LDIF payload can rewrite many entries."""
    isolated_store["config"].write_text(
        "auth:\n  mode: none\n  default_role: readwrite\n\nclusters:\n"
        "  - name: prod\n    host: h.example.com\n    bind_dn: cn=admin,dc=x\n"
    )
    response = client.post("/api/ldif/import", json={"cluster_name": "prod", "ldif": "dn: a,dc=x\nobjectClass: top\n"})
    assert response.status_code == 403


def test_import_forbidden_on_readonly_cluster(client, isolated_store, monkeypatch):
    write_config(isolated_store, readonly=True)
    patch_client(monkeypatch, FakeClient(None))
    response = client.post("/api/ldif/import", json={"cluster_name": "prod", "ldif": "dn: a,dc=x\nobjectClass: top\n"})
    assert response.status_code == 403


def test_dry_run_allowed_for_readwrite_but_apply_is_not(client, isolated_store, monkeypatch):
    """A write role may Validate (parse only); only admin may Apply."""
    isolated_store["config"].write_text(
        "auth:\n  mode: none\n  default_role: readwrite\n\nclusters:\n"
        "  - name: prod\n    host: ldap.example.com\n    port: 389\n"
        "    bind_dn: cn=admin,dc=example,dc=com\n    base_dn: dc=example,dc=com\n"
    )
    fake = patch_client(monkeypatch, FakeClient(None))
    payload = {"cluster_name": "prod", "ldif": "dn: uid=a,dc=x\nobjectClass: top\n"}

    dry = client.post("/api/ldif/import", json={**payload, "dry_run": True})
    assert dry.status_code == 200, dry.text
    assert dry.json()["records"] == 1
    assert fake.calls == [], "a dry run must not write"

    apply = client.post("/api/ldif/import", json=payload)
    assert apply.status_code == 403
    assert "admin" in apply.json()["detail"].lower()
    assert fake.calls == [], "a refused apply must not write"
