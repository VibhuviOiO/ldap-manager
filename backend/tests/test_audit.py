"""
Tests for the audit trail.
"""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core import audit
from app.core.auth import Identity, Role


@pytest.fixture
def client(isolated_store):
    from app.main import app

    with TestClient(app) as test_client:
        yield test_client


def admin():
    return Identity(subject="alice", role=Role.ADMIN, authenticated=True, method="local")


def test_record_and_read_roundtrip(isolated_store):
    audit.record(admin(), "entry.delete", cluster="prod", target="uid=a,dc=x")
    entries = audit.read()
    assert len(entries) == 1
    assert entries[0]["actor"] == "alice"
    assert entries[0]["role"] == "admin"
    assert entries[0]["action"] == "entry.delete"
    assert entries[0]["target"] == "uid=a,dc=x"


def test_read_is_newest_first(isolated_store):
    for i in range(3):
        audit.record(admin(), "entry.create", target=f"uid={i},dc=x")
    assert [e["target"] for e in audit.read()] == ["uid=2,dc=x", "uid=1,dc=x", "uid=0,dc=x"]


def test_filters(isolated_store):
    audit.record(admin(), "entry.create", target="a")
    audit.record(SimpleNamespace(subject="bob", role=Role.READONLY, authenticated=True), "entry.delete", target="b")
    assert len(audit.read(actor="bob")) == 1
    assert len(audit.read(action="entry.")) == 2   # prefix match
    assert len(audit.read(action="entry.create")) == 1
    assert len(audit.read(actor="nobody")) == 0


def test_result_filter_and_summary(isolated_store):
    audit.record(admin(), "entry.create", result="ok")
    audit.record(admin(), "entry.delete", result="error 400")
    assert len(audit.read(result="error 400")) == 1
    summary = audit.summarise(audit.read())
    assert summary["total"] == 2 and summary["failures"] == 1
    assert summary["by_actor"] == {"alice": 2}


def test_malformed_lines_do_not_hide_good_ones(isolated_store):
    audit.record(admin(), "entry.create", target="good")
    path = audit.audit_path()
    with path.open("a", encoding="utf-8") as handle:
        handle.write("{not json\n")
    entries = audit.read()
    assert len(entries) == 1 and entries[0]["target"] == "good"


def test_recording_never_raises(isolated_store, monkeypatch):
    monkeypatch.setattr(audit, "audit_path", lambda: (_ for _ in ()).throw(OSError("nope")))
    audit.record(admin(), "entry.create")  # must not raise


def test_endpoint_requires_admin(client, isolated_store):
    isolated_store["config"].write_text("auth:\n  mode: none\n  default_role: readonly\n")
    assert client.get("/api/audit").status_code == 403


def test_endpoint_returns_entries_for_admin(client, isolated_store):
    isolated_store["config"].write_text("auth:\n  mode: none\n  default_role: admin\n")
    audit.record(admin(), "entry.create", cluster="prod", target="uid=a,dc=x")
    body = client.get("/api/audit?limit=5").json()
    assert body["summary"]["total"] == 1
    assert body["entries"][0]["target"] == "uid=a,dc=x"
