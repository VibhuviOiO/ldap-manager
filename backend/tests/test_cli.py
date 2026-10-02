"""
Tests for `python -m app.cli validate`.

The regression that matters most is test_shipped_example_config_is_valid: the
Pydantic models disagreed with the documented config in three places
(user_creation_form, table_columns, form field `default`), so the validator used
to reject the project's own config.example.yml.
"""

import json
from pathlib import Path

import pytest

from app.cli import main

def _find_repo_root() -> Path:
    """The directory holding config.example.yml, if this checkout has it.

    In a backend-only container (backend/ mounted at /app) the repo root is not
    present, so those tests skip rather than fail.
    """
    for parent in Path(__file__).resolve().parents:
        if (parent / "config.example.yml").exists():
            return parent
    return Path(__file__).resolve().parents[2]


REPO_ROOT = _find_repo_root()
HAS_REPO_CONFIGS = (REPO_ROOT / "config.example.yml").exists()

needs_repo_configs = pytest.mark.skipif(
    not HAS_REPO_CONFIGS, reason="config.example.yml not present (backend-only mount)"
)


def write(tmp_path, body: str) -> Path:
    path = tmp_path / "config.yml"
    path.write_text(body)
    return path


def run(capsys, *args):
    code = main(["validate", *args])
    captured = capsys.readouterr()
    return code, captured.out + captured.err


MINIMAL = """
clusters:
  - name: prod
    host: ldap.example.com
    port: 389
    bind_dn: cn=admin,dc=example,dc=com
    base_dn: dc=example,dc=com
"""


# ------------------------------------------------------------- happy paths --


@needs_repo_configs
def test_shipped_example_config_is_valid(capsys):
    """The documented example must pass, or the docs and the schema disagree."""
    code, out = run(capsys, "--config", str(REPO_ROOT / "config.example.yml"))
    assert code == 0, out
    assert "VALID" in out


@needs_repo_configs
def test_shipped_minimal_config_is_valid(capsys):
    code, out = run(capsys, "--config", str(REPO_ROOT / "config.minimal.yml"))
    assert code == 0, out
    assert "VALID" in out


def test_minimal_config_is_valid(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", raising=False)
    code, out = run(capsys, "--config", str(write(tmp_path, MINIMAL)))
    assert code == 0, out
    assert "VALID" in out


def test_json_output_shape(tmp_path, capsys):
    code, out = run(capsys, "--config", str(write(tmp_path, MINIMAL)), "--json")
    assert code == 0
    payload = json.loads(out)
    assert payload["ok"] is True
    assert payload["clusters"] == ["prod"]
    assert payload["errors"] == []


# ------------------------------------------------------------ config errors --


def test_missing_file_fails(tmp_path, capsys):
    code, out = run(capsys, "--config", str(tmp_path / "nope.yml"))
    assert code == 1
    assert "not found" in out


def test_invalid_yaml_fails(tmp_path, capsys):
    code, out = run(capsys, "--config", str(write(tmp_path, "clusters: [unclosed")))
    assert code == 1
    assert "Invalid YAML" in out


def test_no_clusters_key_fails(tmp_path, capsys):
    code, out = run(capsys, "--config", str(write(tmp_path, "auth:\n  mode: none\n")))
    assert code == 1
    assert "clusters" in out


def test_duplicate_cluster_names_fail(tmp_path, capsys):
    body = MINIMAL + """  - name: prod
    host: other.example.com
    bind_dn: cn=admin,dc=example,dc=com
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "duplicate" in out.lower()


def test_host_and_nodes_together_fail(tmp_path, capsys):
    body = """
clusters:
  - name: prod
    host: a.example.com
    nodes:
      - host: b.example.com
        port: 389
    bind_dn: cn=admin,dc=example,dc=com
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "not both" in out


def test_cluster_with_neither_host_nor_nodes_fails(tmp_path, capsys):
    body = """
clusters:
  - name: prod
    bind_dn: cn=admin,dc=example,dc=com
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "host" in out


def test_bad_node_port_fails(tmp_path, capsys):
    body = """
clusters:
  - name: prod
    nodes:
      - host: a.example.com
        port: 99999
    bind_dn: cn=admin,dc=example,dc=com
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "65535" in out


# -------------------------------------------------------------- auth checks --


def test_unknown_auth_mode_fails(tmp_path, capsys):
    code, out = run(capsys, "--config", str(write(tmp_path, "auth:\n  mode: keycloak\n" + MINIMAL)))
    assert code == 1
    assert "keycloak" in out


def test_unknown_default_role_fails(tmp_path, capsys):
    body = "auth:\n  mode: none\n  default_role: superuser\n" + MINIMAL
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "superuser" in out


def test_bad_session_lifetime_fails(tmp_path, capsys):
    body = "auth:\n  mode: none\n  session:\n    lifetime_hours: -1\n" + MINIMAL
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "lifetime_hours" in out


def test_none_readonly_warns_about_read_only(tmp_path, capsys):
    body = "auth:\n  mode: none\n  default_role: readonly\n" + MINIMAL
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0
    assert "READ-ONLY" in out


def test_ldap_cluster_must_exist(tmp_path, capsys):
    body = (
        "auth:\n  mode: ldap\n  ldap:\n    cluster: ghost\n"
        '    user_dn_template: "uid={username},dc=x"\n'
        + MINIMAL
    )
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "ghost" in out


def test_ldap_needs_a_way_to_find_users(tmp_path, capsys):
    body = "auth:\n  mode: ldap\n  ldap:\n    cluster: prod\n" + MINIMAL
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "user_dn_template" in out


def test_ldap_unknown_group_role_fails(tmp_path, capsys):
    body = (
        "auth:\n  mode: ldap\n  ldap:\n    cluster: prod\n"
        '    user_dn_template: "uid={username},dc=x"\n'
        "    role_map:\n      groups:\n        \"cn=admins,dc=x\": emperor\n"
        + MINIMAL
    )
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "emperor" in out


def test_ldap_empty_group_map_warns(tmp_path, capsys):
    body = (
        "auth:\n  mode: ldap\n  ldap:\n    cluster: prod\n"
        '    user_dn_template: "uid={username},dc=x"\n'
        "    role_map:\n      groups: {}\n"
        + MINIMAL
    )
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0
    assert "default role" in out


def test_ldap_block_ignored_warns_when_mode_is_none(tmp_path, capsys):
    body = (
        "auth:\n  mode: none\n  ldap:\n    cluster: prod\n"
        '    user_dn_template: "uid={username},dc=x"\n'
        + MINIMAL
    )
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0
    assert "ignored" in out


# -------------------------------------------------------- credential checks --


def test_unknown_credential_source_fails(tmp_path, capsys):
    body = """
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    credential:
      source: vault
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "vault" in out


@pytest.mark.parametrize("removed", ["stored", "prompt"])
def test_removed_credential_sources_are_rejected(tmp_path, capsys, removed):
    """The runtime credential store is gone: only env/file/config remain."""
    body = f"""
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    credential:
      source: {removed}
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert removed in out


def test_file_credential_missing_fails(tmp_path, capsys):
    body = f"""
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    credential:
      source: file
      file: {tmp_path}/absent
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "not found" in out


def test_file_credential_present_is_ok(tmp_path, capsys):
    secret = tmp_path / "prod.pw"
    secret.write_text("hunter2")
    body = f"""
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    credential:
      source: file
      file: {secret}
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0, out
    assert "password from" in out


def test_env_credential_unset_warns_but_passes(tmp_path, capsys, monkeypatch):
    monkeypatch.delenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", raising=False)
    body = """
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    credential:
      source: env
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0
    assert "is not set" in out


def test_env_credential_set_is_reported(tmp_path, capsys, monkeypatch):
    monkeypatch.setenv("LDAP_MANAGER_CLUSTER_PROD_PASSWORD", "secret")
    body = """
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    credential:
      source: env
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0
    assert "LDAP_MANAGER_CLUSTER_PROD_PASSWORD" in out


def test_plaintext_config_source_warns(tmp_path, capsys):
    body = """
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    credential:
      source: config
      bind_password: hunter2
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0
    assert "PLAINTEXT" in out
    assert "hunter2" not in out, "the validator must not echo the secret"


def test_config_source_without_password_fails(tmp_path, capsys):
    body = """
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    credential:
      source: config
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "bind_password" in out


# ------------------------------------------------------- form builder checks --


def test_bad_form_field_type_fails(tmp_path, capsys):
    body = """
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    user_creation_form:
      base_ou: ou=People,dc=example,dc=com
      fields:
        - name: uid
          label: Username
          type: telepathy
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 1
    assert "telepathy" in out or "type" in out


def test_numeric_form_default_is_allowed(tmp_path, capsys):
    """gidNumber/shadowMax use integer defaults in config.example.yml."""
    body = """
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    user_creation_form:
      base_ou: ou=People,dc=example,dc=com
      fields:
        - name: gidNumber
          label: Primary Group ID
          type: number
          default: 100
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0, out


def test_form_without_fields_warns(tmp_path, capsys):
    body = """
clusters:
  - name: prod
    host: ldap.example.com
    bind_dn: cn=admin,dc=example,dc=com
    user_creation_form:
      base_ou: ou=People,dc=example,dc=com
"""
    code, out = run(capsys, "--config", str(write(tmp_path, body)))
    assert code == 0
    assert "no 'fields'" in out
