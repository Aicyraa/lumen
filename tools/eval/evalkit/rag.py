"""One call to the rag-service /internal/query (the evaluation talks to it directly)."""

from dataclasses import dataclass, field

from evalkit.config import Config
from evalkit.http import request_with_backoff


@dataclass
class RagAnswer:
    answer: str = ""
    sources: list = field(default_factory=list)
    tier: str = ""
    escalated: bool = False
    top_score: float | None = None
    latency_ms: int | None = None
    attempts: list = field(default_factory=list)
    error: str = ""  # error code when the service did not answer


def query_rag(cfg: Config, tenant_id: str, query: str, force_tier: str | None) -> RagAnswer:
    body = {"tenant_id": tenant_id, "query": query, "models": cfg.models_payload()}
    if force_tier:  # absent means the rule router decides
        body["force_tier"] = force_tier
    r = request_with_backoff(
        "POST", f"{cfg.rag_url}/internal/query", json_body=body, timeout=cfg.timeout_seconds,
        headers={"X-Internal-Secret": cfg.internal_secret}, retries=cfg.backoff_retries,
    )  # fmt: skip
    data = r.body if isinstance(r.body, dict) else {}
    if r.status != 200:
        err = data.get("error")
        code = err.get("code") if isinstance(err, dict) else None
        return RagAnswer(error=str(code or f"http_{r.status}"))
    route, usage = data.get("route") or {}, data.get("usage") or {}
    return RagAnswer(
        answer=data.get("answer") or "",
        sources=data.get("sources") or [],
        tier=route.get("model_tier") or "",
        escalated=bool(route.get("escalated")),
        top_score=route.get("top_score"),
        latency_ms=usage.get("latency_ms"),
        attempts=data.get("attempts") or [],
    )
