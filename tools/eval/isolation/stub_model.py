"""A local OpenAI-compatible model server: free, deterministic, fast.
It answers the rag-service prompt with one claim quoting an exact short span of the first passage, so the
service's own quote validation accepts it. It answers the API's connection test ("Reply with OK.") with OK."""

import json
import re
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SPAN_CHARS = 110  # long enough to reach the planted code word at the start of a document
_FIRST = re.compile(r"^Passages:\n\[1\] (.*?)(?:\n\[2\] |\n\nQuestion: )", re.S)


def first_passage(user_text: str) -> str | None:
    m = _FIRST.match(user_text)
    return m.group(1) if m else None


def quote_span(passage: str, max_chars: int = SPAN_CHARS) -> str:
    """The longest word-aligned prefix of the passage that fits in max_chars (at least one word)."""
    if len(passage) <= max_chars:
        return passage
    cut = passage[:max_chars].rsplit(" ", 1)[0]
    return cut or passage.split(" ", 1)[0]


def answer_for(messages: list[dict]) -> str:
    passage = first_passage(messages[-1].get("content", "")) if messages else None
    if passage is None:
        return "OK"
    span = quote_span(passage)
    return json.dumps({"claims": [{"text": span, "evidence": [{"passage": 1, "quote": span}]}]})


class StubModel:
    """Serves on localhost (IPv4 and IPv6 on one port) because endpoint guards require the name 'localhost'."""

    def __init__(self):
        self.calls = 0
        self.answer_calls = 0  # calls that carried passages (a real chat, not the connection test)
        self._servers, self.port = [], 0

    def _handler(self):
        outer = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                raw = self.rfile.read(int(self.headers.get("content-length") or 0))
                try:
                    msgs = json.loads(raw)["messages"]
                    content = answer_for(msgs)
                    status, payload = 200, {
                        "id": "stub", "object": "chat.completion",
                        "choices": [{"index": 0, "finish_reason": "stop",
                                     "message": {"role": "assistant", "content": content}}],
                        "usage": {"prompt_tokens": max(1, len(raw) // 4),
                                  "completion_tokens": max(1, len(content) // 4), "total_tokens": 1},
                    }  # fmt: skip
                except (ValueError, KeyError, TypeError):
                    content, status, payload = "", 400, {"error": {"message": "bad request"}}
                outer.calls += 1
                outer.answer_calls += content not in ("", "OK")
                data = json.dumps(payload).encode()
                self.send_response(status)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        return H

    def _serve(self, family, host, port):
        class S(ThreadingHTTPServer):
            address_family = family
            daemon_threads = True

        srv = S((host, port), self._handler())
        threading.Thread(
            target=srv.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True
        ).start()
        self._servers.append(srv)
        return srv.server_address[1]

    def start(self):
        for _ in range(20):  # the same port number on ::1 and 127.0.0.1
            probe = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
            probe.bind(("::1", 0))
            port = probe.getsockname()[1]
            probe.close()
            try:
                self._serve(socket.AF_INET6, "::1", port)
                self._serve(socket.AF_INET, "127.0.0.1", port)
                self.port = port
                return self
            except OSError:
                self.stop()
        raise OSError("no free port for the stub model server")

    def stop(self):
        for s in self._servers:
            s.shutdown()
            s.server_close()
        self._servers = []

    @property
    def url(self) -> str:
        return f"http://localhost:{self.port}/v1"

    def __enter__(self):
        return self.start()

    def __exit__(self, *exc):
        self.stop()
