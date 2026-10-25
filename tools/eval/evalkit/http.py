"""Small standard-library HTTP client with backoff on 429 (Retry-After and x-ratelimit-* headers)."""

import http.client
import json
import re
import urllib.error
import urllib.request
from time import sleep  # tests replace evalkit.http.sleep
from typing import Any, NamedTuple

BASE_WAIT, MAX_WAIT = 1.0, 300.0  # exponential fallback and the longest single wait


class HttpError(Exception):
    """The server could not be reached (not an HTTP status)."""

    def __init__(self, message, cause_name="HttpError"):
        super().__init__(message)
        self.cause_name = cause_name  # short class name of the cause: no URL, no headers


class HttpResult(NamedTuple):
    status: int
    headers: dict
    body: Any  # parsed JSON, or None when the body is not JSON
    text: str
    set_cookies: tuple = ()  # every Set-Cookie header, in order


def request(method, url, *, headers=None, json_body=None, data=None, timeout=60.0) -> HttpResult:
    """JSON by default; `data` sends raw bytes (set your own content-type, for example multipart)."""
    if json_body is not None:
        data = json.dumps(json_body).encode()
    h = {
        "content-type": "application/json",
        "user-agent": "lumen-eval/0.1",
        **{k.lower(): v for k, v in (headers or {}).items()},
    }
    req = urllib.request.Request(url, data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            status, hdrs, raw = resp.status, resp.headers, resp.read()
    except urllib.error.HTTPError as e:
        status, hdrs, raw = e.code, e.headers, e.read()
    except (urllib.error.URLError, http.client.HTTPException, TimeoutError, OSError) as e:
        cause = getattr(e, "reason", e)  # URLError wraps the real error
        name = type(cause).__name__
        raise HttpError(f"{method} {url.split('?')[0]} failed: {name}", name) from None
    text = raw.decode("utf-8", "replace")
    try:
        body = json.loads(text)
    except ValueError:
        body = None
    cookies = tuple(hdrs.get_all("Set-Cookie") or ())
    return HttpResult(status, {k.lower(): v for k, v in hdrs.items()}, body, text, cookies)


_PART = re.compile(r"(\d+(?:\.\d+)?)(ms|h|m|s)")
_UNIT = {"ms": 0.001, "s": 1, "m": 60, "h": 3600}


def parse_duration(value: str) -> float | None:
    """'7.66s', '2m59.56s', '120ms', '1h1m' or plain seconds ('3') -> seconds."""
    value = value.strip()
    try:
        return float(value)
    except ValueError:
        pass
    parts = _PART.findall(value)
    if not parts or "".join(n + u for n, u in parts) != value:
        return None
    return sum(float(n) * _UNIT[u] for n, u in parts)


def requested_wait(headers: dict) -> float | None:
    """Seconds the server asks for: Retry-After, or the reset time of an empty rate-limit bucket (uncapped)."""
    waits = []
    if "retry-after" in headers:
        waits.append(parse_duration(headers["retry-after"]))
    for bucket in ("requests", "tokens"):
        left = headers.get(f"x-ratelimit-remaining-{bucket}")
        if left is not None and left.strip() in ("0", "0.0"):
            waits.append(parse_duration(headers.get(f"x-ratelimit-reset-{bucket}", "")))
    waits = [w for w in waits if w is not None]
    return max(waits) if waits else None


def retry_delay(headers: dict, attempt: int) -> float:
    """Seconds to wait after a 429: what the server asked for, else exponential; never more than MAX_WAIT."""
    wait = requested_wait(headers)
    return min(wait, MAX_WAIT) if wait is not None else min(BASE_WAIT * 2**attempt, MAX_WAIT)


def request_with_backoff(method, url, *, retries=5, **kw) -> HttpResult:
    """Like request(), but a 429 is retried up to `retries` times after the wait the server asked for."""
    for attempt in range(retries + 1):
        r = request(method, url, **kw)
        if r.status != 429 or attempt == retries:
            return r
        sleep(retry_delay(r.headers, attempt))
    raise AssertionError("unreachable")
