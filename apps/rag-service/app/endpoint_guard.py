import ipaddress
import socket
from urllib.parse import urlparse

# Rule 12: tenant-supplied endpoints are untrusted. Defence in depth: Express checks too.


class EndpointError(Exception):
    """The endpoint URL is not allowed. The message is safe to show (it never contains the URL)."""


NAT64 = ipaddress.ip_network("64:ff9b::/96")  # can wrap a private IPv4 address


def _resolve(host: str) -> list[str]:
    return [info[4][0] for info in socket.getaddrinfo(host, None)]


def _is_loopback(ip) -> bool:
    return ip.is_loopback


def _is_public(ip) -> bool:
    if ip.version == 6 and ip.ipv4_mapped:  # ::ffff:10.0.0.1 is the IPv4 address
        ip = ip.ipv4_mapped
    # is_global is false for private, loopback, link-local (incl. 169.254.169.254), CGNAT and reserved ranges
    return ip.is_global and not ip.is_multicast and not (ip.version == 6 and ip in NAT64)


def assert_endpoint(url: str, production: bool, resolve=_resolve) -> None:
    """Raise EndpointError unless the URL is https (or http://localhost outside production) and only
    resolves to public addresses. shortcut: checked just before the call, so a DNS answer that changes
    in between (rebinding) is not caught; upgrade by pinning the checked IP in the transport."""
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        parsed.port  # raises ValueError on a bad port
    except ValueError:
        raise EndpointError("The endpoint URL is not valid.") from None
    local_dev = not production and parsed.scheme == "http" and host == "localhost"
    if not host or (parsed.scheme != "https" and not local_dev):
        raise EndpointError("The endpoint URL must use https.")
    if parsed.username or parsed.password:
        raise EndpointError("The endpoint URL must not contain credentials.")
    try:
        ipaddress.ip_address(host)
        addresses = [host]  # a literal IP needs no DNS
    except ValueError:
        try:
            addresses = resolve(host)
        except OSError:
            raise EndpointError("The endpoint host could not be resolved.") from None
    if not addresses:
        raise EndpointError("The endpoint host did not resolve to an address.")
    for raw in addresses:
        ip = ipaddress.ip_address(raw.split("%")[0])  # drop an IPv6 zone id
        if local_dev and _is_loopback(ip):
            continue
        if not _is_public(ip):
            raise EndpointError("The endpoint points to a private or internal address, which is not allowed.")
