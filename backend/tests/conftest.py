"""
Shared pytest fixtures and configuration.
"""

import pytest
from pathlib import Path
import tempfile
import shutil


@pytest.fixture(scope="session")
def temp_test_dir():
    """Create temporary directory for test files."""
    temp_dir = Path(tempfile.mkdtemp(prefix="ldap_manager_test_"))
    yield temp_dir
    # Cleanup after all tests
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def mock_config_file(temp_test_dir):
    """Create mock config.yml file."""
    config_content = """
clusters:
  - name: test-cluster
    host: ldap.example.com
    port: 389
    bind_dn: cn=admin,dc=example,dc=com
    base_dn: dc=example,dc=com
    readonly: false
    description: Test LDAP Server

  - name: ha-cluster
    nodes:
      - host: ldap1.example.com
        port: 389
        name: primary
      - host: ldap2.example.com
        port: 390
        name: secondary
    bind_dn: cn=admin,dc=test,dc=com
    base_dn: dc=test,dc=com
    readonly: false
"""

    config_file = temp_test_dir / "config.yml"
    config_file.write_text(config_content)
    return config_file


@pytest.fixture(autouse=True)
def reset_module_cache():
    """Reset module-level caches between tests."""
    # This prevents test pollution from cached values
    yield
    # Cleanup code can go here if needed


@pytest.fixture(autouse=True)
def legacy_admin_identity(request, monkeypatch):
    """
    Tests written before RBAC call write endpoints without signing in, which now
    returns 403 for the default readonly role.

    Give those modules an admin identity so they keep testing what they were
    written to test. The modules listed below opt out, because they exercise the
    real authentication and role enforcement paths.
    """
    module = request.module.__name__.rsplit(".", 1)[-1]
    if module in {"test_auth", "test_backup", "test_tree", "test_bulk", "test_ldif_import", "test_schema", "test_aci", "test_audit"}:
        return

    from app.core.auth import Identity, Role
    from app.core import rbac

    monkeypatch.setattr(
        rbac,
        "resolve_identity",
        lambda request: Identity(
            subject="test-admin", role=Role.ADMIN, authenticated=True, method="test"
        ),
    )


@pytest.fixture
def isolated_store(tmp_path, monkeypatch):
    """
    Point every secret and config path at a temp directory, so tests never touch
    /app/.secrets or a real config.yml.
    """
    sec = tmp_path / "secrets"
    sec.mkdir()

    from app.core import secrets, config as config_module

    monkeypatch.setattr(secrets, "SECRETS_DIR", sec, raising=False)
    monkeypatch.setattr(secrets, "USERS_FILE", sec / "users.enc", raising=False)
    monkeypatch.setattr(secrets, "SESSION_KEY_FILE", sec / "session.key", raising=False)
    # Fresh Fernet cipher so the temp secrets dir's key is used, not a cached one
    monkeypatch.setattr(secrets, "_fernet", None, raising=False)

    config_file = tmp_path / "config.yml"
    monkeypatch.setattr(config_module, "CONFIG_PATH", config_file, raising=False)
    # The audit log is written under DATA_DIR; keep it out of the repo too.
    monkeypatch.setattr(config_module, "DATA_DIR", tmp_path, raising=False)

    return {"config": config_file, "secrets": sec}


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "unit: mark test as a unit test (fast, isolated)"
    )
    config.addinivalue_line(
        "markers", "integration: mark test as an integration test"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow-running"
    )
