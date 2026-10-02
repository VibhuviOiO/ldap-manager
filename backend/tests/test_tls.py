"""
Tests for TLS/LDAPS support: config parsing, the LDAPConfig kwargs helper, and
the connect() code path (URL scheme, StartTLS upgrade, verification options).
"""

import ldap
import pytest

from app.core.config import LDAPClusterConfig
from app.core.ldap_client import LDAPClient, LDAPConfig, tls_kwargs


# ------------------------------------------------------------------- config --


def cluster(**tls):
    data = {
        "name": "c", "host": "h", "bind_dn": "cn=a", "base_dn": "dc=x",
    }
    if tls:
        data["tls"] = tls
    return LDAPClusterConfig(data)


def test_tls_defaults_to_none():
    c = cluster()
    assert c.tls_mode == "none"
    assert c.tls_verify is True
    assert c.tls_ca_file is None


def test_tls_block_is_parsed():
    c = cluster(mode="ldaps", ca_file="/certs/ca.crt", verify=False)
    assert c.tls_mode == "ldaps"
    assert c.tls_ca_file == "/certs/ca.crt"
    assert c.tls_verify is False


def test_tls_unknown_mode_falls_back_to_none():
    assert cluster(mode="banana").tls_mode == "none"


def test_tls_kwargs_empty_when_off():
    assert tls_kwargs(cluster()) == {}


def test_tls_kwargs_populated_when_on():
    kwargs = tls_kwargs(cluster(mode="starttls", ca_file="/ca.crt", verify=False))
    assert kwargs["tls_mode"] == "starttls"
    assert kwargs["tls_ca_file"] == "/ca.crt"
    assert kwargs["tls_verify"] is False


# ------------------------------------------------------------------ connect --


class FakeConn:
    def __init__(self, url):
        self.url = url
        self.options = []
        self.starttls_called = False
        self.bound = None

    def set_option(self, option, value):
        self.options.append((option, value))

    def start_tls_s(self):
        self.starttls_called = True

    def simple_bind_s(self, dn, password):
        self.bound = (dn, password)

    def search_s(self, *args, **kwargs):
        return []

    def unbind_s(self):
        pass


@pytest.fixture
def fake_ldap(monkeypatch):
    import app.core.ldap_client as mod

    state = {"conn": None, "options": []}

    def fake_initialize(url):
        state["conn"] = FakeConn(url)
        return state["conn"]

    def fake_set_option(option, value):
        state["options"].append((option, value))

    monkeypatch.setattr(mod.ldap, "initialize", fake_initialize)
    monkeypatch.setattr(mod.ldap, "set_option", fake_set_option)
    return state


def make_client(**kwargs):
    base = dict(host="ldap.example.com", port=636, bind_dn="cn=admin", bind_password="pw", base_dn="dc=x")
    base.update(kwargs)
    return LDAPClient(LDAPConfig(**base))


def test_plain_uses_ldap_scheme(fake_ldap):
    make_client(port=389, tls_mode="none").connect()
    assert fake_ldap["conn"].url == "ldap://ldap.example.com:389"
    assert fake_ldap["conn"].starttls_called is False
    assert fake_ldap["options"] == []          # nothing TLS-related set


def test_ldaps_uses_ldaps_scheme(fake_ldap):
    make_client(tls_mode="ldaps", tls_ca_file="/certs/ca.crt", tls_verify=True).connect()
    assert fake_ldap["conn"].url == "ldaps://ldap.example.com:636"
    assert fake_ldap["conn"].starttls_called is False


def test_ldaps_raises_default_port_389_to_636(fake_ldap):
    make_client(port=389, tls_mode="ldaps").connect()
    assert fake_ldap["conn"].url == "ldaps://ldap.example.com:636"


def test_starttls_connects_plain_then_upgrades(fake_ldap):
    make_client(port=389, tls_mode="starttls").connect()
    assert fake_ldap["conn"].url == "ldap://ldap.example.com:389"
    assert fake_ldap["conn"].starttls_called is True


def test_verify_on_demands_certificate(fake_ldap):
    make_client(tls_mode="ldaps", tls_verify=True).connect()
    options = dict(fake_ldap["options"])
    assert options[ldap.OPT_X_TLS_REQUIRE_CERT] == ldap.OPT_X_TLS_DEMAND


def test_verify_off_accepts_any_certificate(fake_ldap):
    make_client(tls_mode="ldaps", tls_verify=False).connect()
    options = dict(fake_ldap["options"])
    assert options[ldap.OPT_X_TLS_REQUIRE_CERT] == ldap.OPT_X_TLS_NEVER


def test_ca_and_client_cert_files_are_applied(fake_ldap):
    make_client(
        tls_mode="ldaps", tls_ca_file="/ca.crt",
        tls_cert_file="/client.crt", tls_key_file="/client.key",
    ).connect()
    options = dict(fake_ldap["options"])
    assert options[ldap.OPT_X_TLS_CACERTFILE] == "/ca.crt"
    assert options[ldap.OPT_X_TLS_CERTFILE] == "/client.crt"
    assert options[ldap.OPT_X_TLS_KEYFILE] == "/client.key"
    # the context must be rebuilt after changing options
    assert ldap.OPT_X_TLS_NEWCTX in options


def test_connection_failure_names_the_tls_settings(fake_ldap, monkeypatch):
    import app.core.ldap_client as mod

    def boom(url):
        raise ldap.SERVER_DOWN("nope")

    monkeypatch.setattr(mod.ldap, "initialize", boom)
    client = make_client(tls_mode="ldaps", tls_ca_file="/ca.crt", tls_verify=True)
    with pytest.raises(Exception) as excinfo:
        client.connect()
    message = str(excinfo.value)
    assert "TLS mode 'ldaps'" in message
    assert "/ca.crt" in message
    assert "verification ON" in message


def test_tls_setup_failure_explains_itself(monkeypatch):
    import app.core.ldap_client as mod

    def bad_option(option, value):
        raise ldap.LDAPError("option error")

    monkeypatch.setattr(mod.ldap, "set_option", bad_option)
    client = make_client(tls_mode="ldaps", tls_ca_file="/missing/ca.crt")
    with pytest.raises(Exception) as excinfo:
        client.connect()
    assert "LDAP TLS setup failed" in str(excinfo.value)
    assert "ca_file" in str(excinfo.value)
