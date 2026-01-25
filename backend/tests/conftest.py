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
