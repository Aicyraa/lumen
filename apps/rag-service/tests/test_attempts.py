"""One model attempt through the real OpenAI SDK, with a mock HTTP transport (no network, no real LLM)."""
import json
import logging

import httpx2
import pytest

from app import llm

KEY = "sk-secret-key-1234567890"
CFG = {
    "connect_timeout_seconds": 1, "timeout_seconds": 2, "max_output_tokens": 50, "temperature": 0,
    "rate_limit_retry_seconds": 0, "omit_temperature_providers": ["openai", "anthropic"],
    "max_rate_limit_headers": 3, "max_header_value_chars": 20, "snippet_chars": 200,
}


def model(provider="openai_compatible", **over):
    return {"provider": provider, "model_id": "m-1", "endpoint_url": "https://api.example.com/v1/",
            "api_key": KEY, "tenant_model_id": "tm-1", **over}


def completion(text="Hello [1]", tin=12, tout=3, **usage_extra):
    return {"id": "x", "object": "chat.completion", "created": 1, "model": "m-1",
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": tin, "completion_tokens": tout, "total_tokens": tin + tout, **usage_extra}}


@pytest.fixture
def server(monkeypatch):
    """Script the provider: server.replies is a list of httpx2.Response or Exception, popped per request."""
    class Server:
        replies, requests = [], []

        def handler(self, request):
            self.requests.append(request)
            r = self.replies.pop(0)
            if isinstance(r, Exception):
                raise r
            return r

    s = Server()
    s.replies, s.requests = [], []
    monkeypatch.setattr(llm, "TRANSPORT", httpx2.MockTransport(s.handler))
    return s


def run(m=None, **kw):
    return llm.call_model(m or model(), "cheap", "sys", "usr", CFG, production=False, **kw)


def ok(body=None, headers=None):
    return httpx2.Response(200, json=body or completion(), headers=headers)


def test_success_posts_to_chat_completions_with_a_bearer_key_and_reports_tokens(server):
    server.replies = [ok(completion("Open at 8 [1]", 812, 96))]
    a = run()
    assert (a.outcome, a.text, a.tokens_in, a.tokens_out) == ("ok", "Open at 8 [1]", 812, 96)
    assert (a.provider, a.model_id, a.tenant_model_id, a.tier) == ("openai_compatible", "m-1", "tm-1", "cheap")
    assert isinstance(a.latency_ms, int)
    req = server.requests[0]
    assert str(req.url) == "https://api.example.com/v1/chat/completions"
    assert req.headers["authorization"] == f"Bearer {KEY}"
    body = json.loads(req.content)
    assert body["model"] == "m-1" and body["messages"] == [
        {"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}]


@pytest.mark.parametrize("provider,limit_key,has_temperature", [
    ("openai", "max_completion_tokens", False),
    ("anthropic", "max_tokens", False),
    ("google", "max_tokens", True),
    ("openai_compatible", "max_tokens", True),
])
def test_token_limit_and_temperature_depend_on_the_provider(server, provider, limit_key, has_temperature):
    server.replies = [ok()]
    run(model(provider))
    body = json.loads(server.requests[0].content)
    assert body[limit_key] == 50
    assert not ({"max_tokens", "max_completion_tokens"} - {limit_key}) & set(body)  # never both
    assert ("temperature" in body) is has_temperature


def test_rate_limit_headers_are_kept_lowercased_bounded_and_only_rate_limit_ones(server):
    server.replies = [ok(headers={
        "X-RateLimit-Remaining-Requests": "99", "x-ratelimit-reset-tokens": "1" * 50, "retry-after": "5",
        "anthropic-ratelimit-requests-limit": "10", "set-cookie": "a=b", "content-type": "application/json"})]
    a = run()
    assert len(a.rate_limits) == 3  # config max_rate_limit_headers
    assert set(a.rate_limits) <= {"x-ratelimit-remaining-requests", "x-ratelimit-reset-tokens", "retry-after",
                                  "anthropic-ratelimit-requests-limit"}
    assert all(isinstance(v, str) and len(v) <= 20 for v in a.rate_limits.values())


def test_no_rate_limit_headers_means_none(server):
    server.replies = [ok()]
    assert run().rate_limits is None


def test_provider_reported_cost_is_returned_only_when_the_response_has_a_number(server):
    server.replies = [ok(completion(cost=0.00042)), ok(), ok(completion(cost="free")), ok(completion(cost=-1))]
    assert run().reported_cost_usd == 0.00042
    assert run().reported_cost_usd is None
    assert run().reported_cost_usd is None
    assert run().reported_cost_usd is None


def test_one_retry_after_a_429_is_still_one_attempt(server):
    server.replies = [httpx2.Response(429, json={"error": {"message": "slow"}}), ok(completion("later"))]
    a = run()
    assert (a.outcome, a.text) == ("ok", "later") and len(server.requests) == 2


def test_second_429_is_rate_limited_with_its_headers_and_no_tokens(server):
    r = httpx2.Response(429, json={"error": {"message": "slow"}}, headers={"retry-after": "7"})
    server.replies = [r, r]
    a = run()
    assert a.outcome == "rate_limited" and len(server.requests) == 2  # exactly one retry
    assert (a.tokens_in, a.tokens_out, a.text) == (None, None, None)
    assert a.rate_limits == {"retry-after": "7"}


@pytest.mark.parametrize("reply,outcome", [
    (httpx2.Response(500, json={"error": {"message": "boom"}}), "error"),
    (httpx2.Response(401, json={"error": {"message": "bad key"}}), "error"),
    (httpx2.Response(200, json={"choices": []}), "error"),  # no answer in the response
    (httpx2.ReadTimeout("slow"), "timeout"),
    (httpx2.ConnectError("refused"), "error"),
])
def test_failures_are_classified_and_never_retried(server, reply, outcome):
    server.replies = [reply]
    a = run()
    assert a.outcome == outcome and len(server.requests) == 1
    assert (a.tokens_in, a.tokens_out, a.text) == (None, None, None)


def test_redirects_are_not_followed(server):
    server.replies = [httpx2.Response(302, headers={"location": "http://169.254.169.254/latest"})]
    a = run()
    assert a.outcome == "error" and len(server.requests) == 1


def test_a_refused_endpoint_is_an_error_attempt_with_zero_requests(server):
    a = run(model(endpoint_url="http://169.254.169.254/v1"))
    assert a.outcome == "error" and server.requests == []


def test_key_and_provider_text_never_reach_the_attempt_or_the_logs(server, caplog):
    caplog.set_level(logging.DEBUG)
    server.replies = [httpx2.Response(401, json={"error": {"message": f"Incorrect key {KEY} for passage text"}})]
    a = run()
    assert KEY not in repr(a) and KEY not in caplog.text and "passage text" not in caplog.text
