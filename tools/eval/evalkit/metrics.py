"""Pure metric arithmetic for results.csv."""

import statistics
from dataclasses import dataclass

RESULT_COLUMNS = [
    "setup", "split", "accuracy", "median_latency_ms", "escalation_rate",
    "unanswerable_handled", "estimated_cost_per_query_usd", "errors",
]  # fmt: skip
SETUPS = ("always_cheap", "always_expensive", "rule_router")
SPLITS = ("train", "held_out")


@dataclass(frozen=True)
class Result:
    setup: str
    split: str
    qtype: str
    correct: bool
    latency_ms: int | None
    tier: str  # route.model_tier: cheap | expensive | none
    top_score: float | None
    cost: float | None  # the tenant's estimated provider cost; None when a used model is unpriced
    query: str = ""
    errored: bool = False  # the service or the judge failed: counted in `errors`, not in accuracy


def cost_of(attempts: list[dict], prices: dict) -> float | None:
    """Estimated provider cost of one query from provider token counts and per-1M prices of the tier."""
    total = 0.0
    for a in attempts:
        p = prices.get(a.get("tier"))
        if p is None:
            return None
        total += (a.get("tokens_in") or 0) / 1e6 * p[0] + (a.get("tokens_out") or 0) / 1e6 * p[1]
    return total


def _mean(xs):
    return round(sum(xs) / len(xs), 10) if xs else ""


def summarize(results: list[Result]) -> list[dict]:
    rows = []
    for setup in SETUPS:
        for split in SPLITS:
            every = [r for r in results if r.setup == setup and r.split == split]
            if not every:
                continue
            rs = [r for r in every if not r.errored]  # accuracy is over the answered questions
            lat = [r.latency_ms for r in rs if r.latency_ms is not None]
            un = [r for r in rs if r.qtype == "unanswerable"]
            costs = [r.cost for r in rs]
            rows.append({
                "setup": setup,
                "split": split,
                "accuracy": _mean([r.correct for r in rs]),
                "median_latency_ms": statistics.median(lat) if lat else "",
                "escalation_rate": _mean([r.tier == "expensive" for r in rs]),
                "unanswerable_handled": _mean([r.correct for r in un]),
                "estimated_cost_per_query_usd": "" if None in costs else _mean(costs),
                "errors": len(every) - len(rs),
            })  # fmt: skip
    return rows


def confident_wrong(results: list[Result], threshold: float) -> list[Result]:
    return [
        r for r in results if not r.correct and r.top_score is not None and r.top_score >= threshold
    ]
