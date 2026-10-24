import math
import time
from dataclasses import dataclass

import httpx2
import openai

from app.core.logging import log
from app.llm.endpoint_guard import EndpointError, assert_endpoint

TRANSPORT = None  # tests set an httpx2 mock transport here; None means the real network


@dataclass
class Attempt:
    provider: str
    model_id: str
    tenant_model_id: str | None
    tier: str  # cheap | expensive | default
    outcome: str = "error"  # ok | error | timeout | rate_limited
    tokens_in: int | None = None  # provider-reported; None for a failed attempt
    tokens_out: int | None = None
    latency_ms: int | None = None
    rate_limits: dict | None = None
    reported_cost_usd: float | None = None
    text: str | None = None

    def public(self) -> dict:
        """What goes in the response `attempts` list (no answer text)."""
        d = {k: v for k, v in self.__dict__.items() if k != "text"}
        return {
            k: v
            for k, v in d.items()
            if v is not None or k in ("tenant_model_id", "tokens_in", "tokens_out")
        }


def _rate_limit_headers(headers, cfg: dict) -> dict | None:
    """Rate-limit response headers as {lowercase name: short string}, at most the configured count."""
    found = {}
    for name, value in headers.items():
        low = name.lower()
        if "ratelimit" in low.replace("-", "") or low == "retry-after":
            found[low] = str(value)[: cfg["max_header_value_chars"]]
    return dict(list(found.items())[: cfg["max_rate_limit_headers"]]) or None


def _reported_cost(usage) -> float | None:
    """Cost the provider itself reports (e.g. OpenRouter usage.cost); anything else is ignored."""
    cost = (getattr(usage, "model_extra", None) or {}).get("cost") if usage else None
    ok = (
        isinstance(cost, (int, float))
        and not isinstance(cost, bool)
        and math.isfinite(cost)
        and cost >= 0
    )
    return float(cost) if ok else None


def call_model(m: dict, tier: str, system: str, user: str, cfg: dict, production: bool) -> Attempt:
    """One attempt with one tenant model. Never raises; the result says what happened.
    The client is built per call from this request's key and closed after: keys are never cached."""
    a = Attempt(m["provider"], m["model_id"], m.get("tenant_model_id"), tier)
    started = time.perf_counter()
    http = client = None
    headers = None
    try:
        assert_endpoint(m["endpoint_url"], production)
        http = httpx2.Client(  # no redirects: a redirect could point at an internal address
            transport=TRANSPORT,
            follow_redirects=False,
            timeout=httpx2.Timeout(cfg["timeout_seconds"], connect=cfg["connect_timeout_seconds"]),
        )
        # max_retries=0: the SDK would retry 429 twice; we want exactly one retry, done below
        client = openai.OpenAI(
            base_url=m["endpoint_url"].rstrip("/"),
            api_key=m["api_key"],
            http_client=http,
            max_retries=0,
        )
        # newer OpenAI models take max_completion_tokens; other servers still expect max_tokens
        args = {
            "max_completion_tokens" if m["provider"] == "openai" else "max_tokens": cfg[
                "max_output_tokens"
            ]
        }
        if (
            m["provider"] not in cfg["omit_temperature_providers"]
        ):  # some models reject any fixed temperature
            args["temperature"] = cfg["temperature"]
        for attempt_no in (1, 2):
            try:
                raw = client.chat.completions.with_raw_response.create(
                    model=m["model_id"],
                    messages=[
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    **args,
                )
                headers = raw.headers
                break
            except openai.RateLimitError as e:
                headers = e.response.headers
                if attempt_no == 2:
                    a.outcome = "rate_limited"
                    return a
                time.sleep(
                    cfg["rate_limit_retry_seconds"]
                )  # free tiers are tight: wait, then try once more
        resp = raw.parse()
        a.text = resp.choices[0].message.content or ""
        a.tokens_in = resp.usage.prompt_tokens if resp.usage else 0  # never estimated
        a.tokens_out = resp.usage.completion_tokens if resp.usage else 0
        a.reported_cost_usd = _reported_cost(resp.usage)
        a.outcome = "ok"
    except EndpointError:
        pass  # refused before any request
    except openai.APITimeoutError:
        a.outcome = "timeout"
    except openai.APIStatusError as e:
        headers = e.response.headers
    except (openai.APIError, IndexError, AttributeError, ValueError):
        pass  # connection failure or an answer without choices
    finally:
        a.latency_ms = int((time.perf_counter() - started) * 1000)
        if headers is not None:
            a.rate_limits = _rate_limit_headers(headers, cfg)
        if a.outcome != "ok":
            a.text = a.tokens_in = a.tokens_out = a.reported_cost_usd = None
        if client:
            client.close()
        if http:
            http.close()
        log.info(
            "model attempt provider=%s tier=%s outcome=%s latency_ms=%d",
            a.provider,
            tier,
            a.outcome,
            a.latency_ms,
        )
    return a
