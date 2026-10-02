"""
Tests for operator-selectable cluster credential sources.

The app is config-file-only: a cluster's bind password comes from an environment
variable, a mounted secret file, or plaintext in config.yml. There is no runtime
store, so these tests only cover resolving those three sources.
"""

import json
from types import SimpleNamespace

from app.core import credentials


def cluster(name="prod", source="env", **kwargs):
    """A stand-in for LDAPClusterConfig with only what credentials.py reads."""
    base = dict(
        name=name,
        bind_dn=f"cn=admin,dc={name},dc=com",
        credential_source=source,
        credential_env=None,
        credential_file=None,
        bind_password=None,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


# ------------------------------------------------------------- source choice --


def test_default_source_is_env(isolated_store):
    assert credentials.source_of(cluster()) == credentials.SOURCE_ENV


def test_unknown_source_falls_back_to_env(isolated_store):
    assert credentials.source_of(cluster(source="vault")) == credentials.SOURCE_ENV


def test_removed_sources_are_not_valid(isolated_store):
    """stored/prompt belonged to the removed runtime credential store."""
    assert "stored" not in credentials.VALID_SOURCES
    assert "prompt" not in credentials.VALID_SOURCES
    assert credentials.VALID_SOURCES == ("env", "file", "config")


def test_env_var_name_is_derived_when_not_set(isolated_store):
    assert credentials.env_var_name(cluster("my-cluster")) == "LDAP_MANAGER_CLUSTER_MY_CLUSTER_PASSWORD"


def test_env_var_name_can_be_overridden(isolated_store):
    c = cluster(source="env", credential_env="PROD_LDAP_PW")
    assert credentials.env_var_name(c) == "PROD_LDAP_PW"


# ------------------------------------------------------------------- sources --


def test_env_source(isolated_store, monkeypatch):
    c = cluster("prod", source="env")
    monkeypatch.delenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", raising=False)
    assert credentials.resolve_password(c) is None

    monkeypatch.setenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", "from-env")
    assert credentials.resolve_password(c) == "from-env"


def test_file_source(isolated_store, tmp_path):
    secret = tmp_path / "prod.pw"
    secret.write_text("from-file\n")  # trailing newline must be trimmed

    c = cluster("prod", source="file", credential_file=str(secret))
    assert credentials.resolve_password(c) == "from-file"


def test_file_source_missing_file_is_none(isolated_store, tmp_path):
    c = cluster("prod", source="file", credential_file=str(tmp_path / "nope"))
    assert credentials.resolve_password(c) is None


def test_file_source_without_path_is_none(isolated_store):
    assert credentials.resolve_password(cluster("prod", source="file")) is None


def test_config_source_reads_plaintext(isolated_store):
    c = cluster("prod", source="config", bind_password="plaintext-in-yaml")
    assert credentials.resolve_password(c) == "plaintext-in-yaml"


def test_describe_never_leaks_the_secret(isolated_store, monkeypatch):
    monkeypatch.setenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", "top-secret-value")
    c = cluster("prod")

    info = credentials.describe(c)
    assert info["source"] == "env"
    assert info["available"] is True
    assert "top-secret-value" not in json.dumps(info)

    monkeypatch.delenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", raising=False)
    env_info = credentials.describe(cluster("e", source="env"))
    assert env_info["env_var"] == "LDAP_MANAGER_CLUSTER_E_PASSWORD"
    assert env_info["available"] is False


# --------------------------------------------------------- config plumbing --


def test_config_parses_credential_block(isolated_store):
    from app.core.config import LDAPClusterConfig

    c = LDAPClusterConfig({
        "name": "prod",
        "host": "ldap.example.com",
        "bind_dn": "cn=admin,dc=example,dc=com",
        "credential": {"source": "file", "file": "/run/secrets/prod"},
    })
    assert c.credential_source == "file"
    assert c.credential_file == "/run/secrets/prod"


def test_config_defaults_credential_source(isolated_store):
    from app.core.config import LDAPClusterConfig

    c = LDAPClusterConfig({
        "name": "prod",
        "host": "ldap.example.com",
        "bind_dn": "cn=admin,dc=example,dc=com",
    })
    assert c.credential_source == "env"
    assert credentials.source_of(c) == "env"


def test_config_tolerates_a_malformed_credential_block(isolated_store):
    from app.core.config import LDAPClusterConfig

    c = LDAPClusterConfig({
        "name": "prod",
        "host": "ldap.example.com",
        "bind_dn": "cn=admin,dc=example,dc=com",
        "credential": "not-a-mapping",
    })
    assert c.credential_source == "env"
