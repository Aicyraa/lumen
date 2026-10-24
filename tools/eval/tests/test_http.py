import pytest

from evalkit.http import HttpError, parse_duration, request, request_with_backoff, retry_delay


def test_parse_duration_formats_used_by_providers():
    assert parse_duration("7.66s") == pytest.approx(7.66)
    assert parse_duration("2m59.56s") == pytest.approx(179.56)
    assert parse_duration("120ms") == pytest.approx(0.12)
    assert parse_duration("1h1m") == 3660
    assert parse_duration("3") == 3
    assert parse_duration("soon") is None


def test_retry_after_wins_and_empty_buckets_are_waited_for():
    assert retry_delay({"retry-after": "4"}, 0) == 4
    h = {"x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "7.5s"}
    assert retry_delay(h, 0) == 7.5
    h = {"x-ratelimit-remaining-requests": "5", "x-ratelimit-reset-requests": "30s"}
    assert retry_delay(h, 0) < 30  # that bucket is not empty, so it is not the reason
    assert retry_delay({}, 0) < retry_delay({}, 3)  # exponential fallback grows


def test_429_is_retried_with_the_requested_wait(server, no_sleep):
    seq = iter([(429, {"retry-after": "2"}, {}), (429, {"x-ratelimit-remaining-tokens": "0",
                "x-ratelimit-reset-tokens": "1.5s"}, {}), (200, {}, {"ok": True})])  # fmt: skip
    s = server(lambda *a: next(seq))
    r = request_with_backoff("POST", s.url + "/x", json_body={"a": 1}, retries=5)
    assert r.status == 200 and r.body == {"ok": True}
    assert no_sleep == [2, 1.5] and len(s.calls) == 3


def test_gives_up_after_the_retries(server, no_sleep):
    s = server(lambda *a: (429, {"retry-after": "1"}, {}))
    r = request_with_backoff("GET", s.url + "/x", retries=2)
    assert r.status == 429 and len(s.calls) == 3 and no_sleep == [1, 1]


def test_other_errors_are_returned_not_retried(server):
    s = server(lambda *a: (500, {}, {"error": "x"}))
    assert request_with_backoff("GET", s.url + "/x", retries=3).status == 500
    assert len(s.calls) == 1


def test_connection_failure_is_an_http_error():
    with pytest.raises(HttpError):
        request("GET", "http://127.0.0.1:1/x", timeout=2)


def test_set_cookies_are_all_kept(server):
    import http.server

    # FakeServer cannot repeat a header, so use a tiny raw server
    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200)
            self.send_header("Set-Cookie", "a=1; Path=/")
            self.send_header("Set-Cookie", "b=2; HttpOnly")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"{}")

        def log_message(self, *a):
            pass

    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H)
    import threading

    threading.Thread(
        target=httpd.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True
    ).start()
    try:
        r = request("GET", f"http://127.0.0.1:{httpd.server_address[1]}/")
    finally:
        httpd.shutdown()
        httpd.server_close()
    assert r.set_cookies == ("a=1; Path=/", "b=2; HttpOnly")


def test_raw_bytes_body_is_sent_with_the_given_content_type(server):
    s = server(lambda *a: (200, {}, {}))
    request(
        "POST",
        s.url + "/up",
        data=b"--x--",
        headers={"content-type": "multipart/form-data; boundary=x"},
    )
    assert s.calls[0]["headers"]["content-type"].startswith("multipart/form-data")
