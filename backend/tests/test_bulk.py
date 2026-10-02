"""
Tests for bulk operations and CSV export.
"""

import json

import pytest
from fastapi.testclient import TestClient


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
    """Stub for LDAPClient that records writes and serves a fixed search page."""

    def __init__(self, config, fail_modify=None):
        self.config = config
        self.calls = []
        self.fail_modify = fail_modify or set()

    def connect(self):
        pass

    def disconnect(self):
        pass

    def modify(self, dn, modifications):
        if dn in self.fail_modify:
            raise Exception(f"modify failed for {dn}")
        self.calls.append(("modify", dn, modifications))

    def add_member_to_group(self, group_dn, member_dn):
        self.calls.append(("add", group_dn, member_dn))

    def remove_member_from_group(self, group_dn, member_dn):
        self.calls.append(("remove", group_dn, member_dn))

    def delete(self, dn):
        self.calls.append(("delete", dn))

    def search(self, base, filter_str, scope=None, attrs=None, page_size=0, cookie=b""):
        # One page, then done.
        return (
            [{"dn": "uid=alice,dc=example,dc=com", "uid": ["alice"], "cn": ["Alice"]}],
            b"",
            1,
        )


def patch_client(monkeypatch, fake):
    from app.api import entries

    monkeypatch.setattr(entries, "resolve_password", lambda c: "secret")
    monkeypatch.setattr(entries, "LDAPClient", lambda config: fake)
    monkeypatch.setattr(
        entries, "NodeSelector",
        type("NS", (), {"select_node": staticmethod(lambda cluster, op: ("ldap.example.com", 389))}),
    )
    return fake


DNS = ["uid=alice,dc=example,dc=com", "uid=bob,dc=example,dc=com"]


def test_bulk_update_applies_to_every_dn(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None))

    response = client.post("/api/entries/bulk/update", json={
        "cluster_name": "prod",
        "dns": DNS,
        "modifications": {"departmentNumber": "Engineering"},
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "success"
    assert body["succeeded"] == DNS
    assert body["errors"] == []
    assert len(fake.calls) == 2
    assert all(call[0] == "modify" for call in fake.calls)


def test_bulk_update_reports_partial_failures(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None, fail_modify={DNS[1]}))

    response = client.post("/api/entries/bulk/update", json={
        "cluster_name": "prod", "dns": DNS, "modifications": {"l": "x"},
    })
    body = response.json()
    assert body["status"] == "partial"
    assert body["succeeded"] == [DNS[0]]
    assert body["errors"][0]["dn"] == DNS[1]


def test_bulk_update_requires_selection(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    patch_client(monkeypatch, FakeClient(None))
    response = client.post("/api/entries/bulk/update", json={
        "cluster_name": "prod", "dns": [], "modifications": {"l": "x"},
    })
    assert response.status_code == 400


def test_bulk_group_add(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None))

    response = client.post("/api/entries/bulk/group", json={
        "cluster_name": "prod",
        "dns": DNS,
        "group_dn": "cn=Engineering,ou=Group,dc=example,dc=com",
        "action": "add",
    })
    assert response.status_code == 200
    assert [c[0] for c in fake.calls] == ["add", "add"]
    assert all(c[1] == "cn=Engineering,ou=Group,dc=example,dc=com" for c in fake.calls)


def test_bulk_group_remove(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None))
    client.post("/api/entries/bulk/group", json={
        "cluster_name": "prod", "dns": DNS, "group_dn": "cn=X", "action": "remove",
    })
    assert [c[0] for c in fake.calls] == ["remove", "remove"]


def test_bulk_group_rejects_bad_action(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    patch_client(monkeypatch, FakeClient(None))
    response = client.post("/api/entries/bulk/group", json={
        "cluster_name": "prod", "dns": DNS, "group_dn": "cn=X", "action": "rename",
    })
    assert response.status_code == 400


def test_bulk_delete(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    fake = patch_client(monkeypatch, FakeClient(None))
    response = client.post("/api/entries/bulk/delete", json={"cluster_name": "prod", "dns": DNS})
    assert response.status_code == 200
    assert response.json()["succeeded"] == DNS
    assert [c[0] for c in fake.calls] == ["delete", "delete"]


def test_bulk_writes_are_forbidden_on_a_readonly_cluster(client, isolated_store, monkeypatch):
    write_config(isolated_store, readonly=True)
    patch_client(monkeypatch, FakeClient(None))
    response = client.post("/api/entries/bulk/update", json={
        "cluster_name": "prod", "dns": DNS, "modifications": {"l": "x"},
    })
    assert response.status_code == 403


def test_bulk_writes_require_readwrite_role(client, isolated_store):
    """mode=none + default_role readonly: anonymous cannot bulk-modify."""
    isolated_store["config"].write_text(
        "auth:\n  mode: none\n  default_role: readonly\n\nclusters:\n"
        "  - name: prod\n    host: h.example.com\n    bind_dn: cn=admin,dc=x\n"
    )
    response = client.post("/api/entries/bulk/delete", json={"cluster_name": "prod", "dns": DNS})
    assert response.status_code == 403


def test_export_csv(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    patch_client(monkeypatch, FakeClient(None))

    response = client.get("/api/entries/export?cluster=prod")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    assert response.headers["x-entry-count"] == "1"

    body = response.text
    lines = body.strip().splitlines()
    assert lines[0].split(",")[0] == "dn"
    assert any("uid=alice,dc=example,dc=com" in line for line in lines[1:])


def test_export_json(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    patch_client(monkeypatch, FakeClient(None))
    response = client.get("/api/entries/export?cluster=prod&format=json")
    body = response.json()
    assert body["count"] == 1
    assert body["entries"][0]["dn"] == "uid=alice,dc=example,dc=com"


def test_export_requires_a_credential(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    from app.api import entries

    monkeypatch.setattr(entries, "resolve_password", lambda c: None)
    assert client.get("/api/entries/export?cluster=prod").status_code == 401


def test_csv_export_excludes_sensitive_attributes():
    from app.api.entries import _entries_to_csv

    csv_text = _entries_to_csv([
        {"dn": "uid=a,dc=x", "uid": ["a"], "userPassword": ["{SSHA}secret"]},
    ])
    assert "userPassword" not in csv_text
    assert "{SSHA}" not in csv_text
    assert "uid" in csv_text
