import pytest

from app.endpoint_guard import EndpointError, assert_endpoint

PUBLIC = "93.184.216.34"


def resolver(*addresses):
    return lambda host: list(addresses)


@pytest.mark.parametrize("url", [
    "http://api.example.com/v1",          # not https
    "ftp://api.example.com/v1",
    "https://user:pw@api.example.com/v1",  # credentials in the URL
    "not a url",
    "https://",
])
def test_bad_scheme_or_shape_is_refused(url):
    with pytest.raises(EndpointError):
        assert_endpoint(url, production=False, resolve=resolver(PUBLIC))


@pytest.mark.parametrize("address", [
    "127.0.0.1", "10.1.2.3", "172.16.0.5", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
    "224.0.0.1", "::1", "fe80::1", "fc00::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "64:ff9b::7f00:1",
    "::127.0.0.1", "::10.0.0.1", "::a00:1", "fec0::1",  # IPv4-compatible (::/96) and site-local
])
def test_private_loopback_link_local_and_metadata_addresses_are_refused(address):
    with pytest.raises(EndpointError):
        assert_endpoint("https://api.example.com/v1", production=False, resolve=resolver(address))


@pytest.mark.parametrize("literal", ["https://127.0.0.1/v1", "https://10.0.0.1/v1", "https://169.254.169.254/v1", "https://[::1]/v1"])
def test_ip_literals_are_checked_without_dns(literal):
    def no_dns(host):
        raise AssertionError("literal IPs must not be resolved")
    with pytest.raises(EndpointError):
        assert_endpoint(literal, production=False, resolve=no_dns)


def test_one_bad_address_among_good_ones_refuses_the_host():
    with pytest.raises(EndpointError):
        assert_endpoint("https://api.example.com/v1", production=False, resolve=resolver(PUBLIC, "10.0.0.9"))


def test_unresolvable_host_is_refused():
    def fail(host):
        raise OSError("nxdomain")
    with pytest.raises(EndpointError):
        assert_endpoint("https://nope.example.com/v1", production=False, resolve=fail)
    with pytest.raises(EndpointError):
        assert_endpoint("https://nope.example.com/v1", production=False, resolve=resolver())


def test_public_https_endpoint_is_accepted():
    assert_endpoint("https://api.example.com/v1", production=True, resolve=resolver(PUBLIC))


def test_http_localhost_is_allowed_only_outside_production():
    assert_endpoint("http://localhost:11434/v1", production=False, resolve=resolver("127.0.0.1", "::1"))
    with pytest.raises(EndpointError):
        assert_endpoint("http://localhost:11434/v1", production=True, resolve=resolver("127.0.0.1"))
    with pytest.raises(EndpointError):  # only the name localhost, not other loopback hosts
        assert_endpoint("http://127.0.0.1:11434/v1", production=False, resolve=resolver("127.0.0.1"))


def test_resolver_answering_an_ipv4_compatible_address_is_refused():
    with pytest.raises(EndpointError):
        assert_endpoint("https://api.example.com/v1", production=False, resolve=lambda host: ["::127.0.0.1"])
