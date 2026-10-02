"""
Tests for the LDIF backup/export endpoint.

The serializer is checked directly because the failure mode is silent: a
mangled binary attribute or an unfolded long line still produces something that
looks like LDIF and fails only on re-import.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.api import backup

CONFIG_TEMPLATE = """
auth:
{auth}

clusters:
  - name: prod
    host: ldap.example.com
    port: 389
    bind_dn: cn=admin,dc=example,dc=com
    base_dn: dc=example,dc=com
    description: Production
"""


def write_config(store, auth="  mode: none\n  default_role: admin\n"):
    store["config"].write_text(CONFIG_TEMPLATE.format(auth=auth))


@pytest.fixture
def client(isolated_store):
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


# ------------------------------------------------------------- serialization --


def test_ldif_basic_shape():
    out = backup._to_ldif([
        ("uid=alice,dc=example,dc=com", {"cn": [b"Alice"], "sn": [b"Smith"]}),
    ])
    assert "dn: uid=alice,dc=example,dc=com" in out
    assert "cn: Alice" in out
    assert "sn: Smith" in out
    assert out.endswith("\n")


def test_ldif_has_no_changetype():
    """LDIFWriter annotates records with changetype: add; an export must not."""
    out = backup._to_ldif([("uid=a,dc=x", {"cn": [b"A"]})])
    assert "changetype" not in out.lower()


def test_ldif_base64_encodes_binary_values():
    """jpegPhoto and friends must be base64'd (double colon), not str()-ed."""
    out = backup._to_ldif([("uid=a,dc=x", {"jpegPhoto": [b"\x89PNG\x00\xff"]})])
    line = [l for l in out.splitlines() if l.startswith("jpegPhoto")][0]
    assert line.startswith("jpegPhoto:: "), line
    assert "b'" not in out, "bytes were rendered with str() instead of base64"


def test_ldif_folds_long_lines():
    """RFC 2849 wraps at 76 columns; an unfolded line breaks re-import."""
    out = backup._to_ldif([("uid=a,dc=x", {"description": [b"y" * 300]})])
    body = [l for l in out.splitlines() if l.startswith(("description", " "))]
    assert len(body) > 1, "long value was not folded"
    assert all(len(l) <= 76 for l in out.splitlines()), [
        (len(l), l[:40]) for l in out.splitlines() if len(l) > 76
    ]


def test_ldif_skips_entries_without_a_dn():
    out = backup._to_ldif([(None, {"cn": [b"x"]}), ("uid=a,dc=x", {"cn": [b"A"]})])
    assert out.count("dn:") == 1


def test_ldif_handles_multiple_entries():
    out = backup._to_ldif([
        ("uid=a,dc=x", {"cn": [b"A"]}),
        ("uid=b,dc=x", {"cn": [b"B"]}),
    ])
    assert out.count("dn:") == 2
    assert "\n\n" in out, "records must be separated by a blank line"


# ---------------------------------------------------------------- the route --


def test_backup_requires_a_configured_credential(client, isolated_store):
    write_config(isolated_store)
    response = client.get("/api/backup/prod")
    assert response.status_code == 401
    assert "credential" in response.json()["detail"].lower()


def test_backup_unknown_cluster_is_404(client, isolated_store):
    write_config(isolated_store)
    assert client.get("/api/backup/nope").status_code == 404


def test_backup_is_admin_only(client, isolated_store):
    """A readonly visitor must not be able to dump the directory."""
    write_config(isolated_store, auth="  mode: none\n  default_role: readonly\n")
    response = client.get("/api/backup/prod")
    assert response.status_code == 403


def test_backup_rejects_a_bad_scope(client, isolated_store):
    write_config(isolated_store)
    assert client.get("/api/backup/prod?scope=everything").status_code == 422


def test_backup_streams_ldif_from_the_directory(client, isolated_store, monkeypatch):
    """End to end with a stubbed LDAP connection."""
    write_config(isolated_store)

    # A credential exists: the cluster's default source is the environment.
    monkeypatch.setenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", "secret")

    class FakeConn:
        def search_ext(self, base, scope, filter_str, attrs, serverctrls=None):
            return 1

        def result3(self, msgid):
            return (
                None,
                [
                    ("dc=example,dc=com", {"dc": [b"example"], "objectClass": [b"top", b"domain"]}),
                    ("uid=alice,dc=example,dc=com", {"cn": [b"Alice"], "userPassword": [b"{SSHA}x"]}),
                ],
                msgid,
                [],
            )

    class FakeClient:
        def __init__(self, config):
            self.conn = FakeConn()

        def connect(self):
            pass

        def disconnect(self):
            pass

    monkeypatch.setattr("app.api.backup.LDAPClient", FakeClient)
    monkeypatch.setattr(
        "app.api.backup.NodeSelector.select_node", lambda cluster, op: ("ldap.example.com", 389)
    )

    response = client.get("/api/backup/prod")
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/ldif")
    assert "attachment" in response.headers["content-disposition"]
    assert ".ldif" in response.headers["content-disposition"]
    assert response.headers["x-entry-count"] == "2"

    body = response.text
    assert "dn: dc=example,dc=com" in body
    assert "dn: uid=alice,dc=example,dc=com" in body
    assert "cn: Alice" in body
    assert "changetype" not in body.lower()


def test_backup_empty_result_is_404(client, isolated_store, monkeypatch):
    write_config(isolated_store)
    monkeypatch.setenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", "secret")

    class FakeClient:
        def __init__(self, config):
            self.conn = self

        def connect(self):
            pass

        def disconnect(self):
            pass

        def search_ext(self, *a, **k):
            return 1

        def result3(self, msgid):
            return (None, [], msgid, [])

    monkeypatch.setattr("app.api.backup.LDAPClient", FakeClient)
    monkeypatch.setattr(
        "app.api.backup.NodeSelector.select_node", lambda cluster, op: ("ldap.example.com", 389)
    )

    assert client.get("/api/backup/prod").status_code == 404
