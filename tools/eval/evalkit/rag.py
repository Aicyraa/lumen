"""One call to the rag-service /internal/query (the evaluation talks to it directly)."""

from dataclasses import dataclass, field

from evalkit import http
from evalkit.config import Config
from evalkit.http import HttpError, request_with_backoff, requested_wait, retry_delay


@dataclass
class RagAnswer:
    answer: str = ""
    sources: list = field(default_factory=list)
    tier: str = ""
    top_score: float | None = None
    latency_ms: int | None = None
    attempts: list = field(default_factory=list)
    error: str = ""  # error code when the service did not answer
    connection_failed: bool = False  # the service could not be reached at all
    quota_exhausted: bool = (
        False  # the provider asked for a wait longer than cfg.quota_wait_seconds
    )


def _provider_rate_limit(data) -> dict | None:
    """The rate-limit headers of the last rate-limited attempt in a 502 body, or None for other failures."""
    limited = [a for a in data.get("attempts") or [] if a.get("outcome") == "rate_limited"]
    return (limited[-1].get("rate_limits") or {}) if limited else None


def query_rag(cfg: Config, tenant_id: str, query: str, force_tier: str | None) -> RagAnswer:
    for attempt in range(cfg.backoff_retries + 1):
        a, limit = _query_once(cfg, tenant_id, query, force_tier)
        if limit is None or attempt == cfg.backoff_retries:
            return a
        asked = requested_wait(limit)
        if asked is not None and asked > cfg.quota_wait_seconds:
            return RagAnswer(error="quota_exhausted", quota_exhausted=True)
        http.sleep(retry_delay(limit, attempt))  # looked up at call time so tests can replace it
    raise AssertionError("unreachable")


def _query_once(cfg: Config, tenant_id: str, query: str, force_tier: str | None):
    body = {"tenant_id": tenant_id, "query": query, "models": cfg.models_payload()}
    if force_tier:  # absent means the rule router decides
        body["force_tier"] = force_tier
    try:
        r = request_with_backoff(
            "POST", f"{cfg.rag_url}/internal/query", json_body=body, timeout=cfg.timeout_seconds,
            headers={"X-Internal-Secret": cfg.internal_secret}, retries=cfg.backoff_retries,
        )  # fmt: skip
    except HttpError as e:  # unreachable, dropped or timed out: a system error, not a crash
        return RagAnswer(error=e.cause_name, connection_failed=True), None
    data = r.body if isinstance(r.body, dict) else {}
    if r.status != 200:
        err = data.get("error")
        code = err.get("code") if isinstance(err, dict) else None
        return RagAnswer(error=str(code or f"http_{r.status}")), _provider_rate_limit(data)
    route, usage = data.get("route") or {}, data.get("usage") or {}
    return RagAnswer(
        answer=data.get("answer") or "",
        sources=data.get("sources") or [],
        tier=route.get("model_tier") or "",
        top_score=route.get("top_score"),
        latency_ms=usage.get("latency_ms"),
        attempts=data.get("attempts") or [],
    ), None
