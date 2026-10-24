from evalkit.metrics import RESULT_COLUMNS, Result, confident_wrong, cost_of, summarize


def res(setup="always_cheap", split="train", qtype="easy", correct=True, latency=100,
        tier="cheap", top=0.8, cost=0.001, query="q"):  # fmt: skip
    return Result(setup, split, qtype, correct, latency, tier, top, cost, query)


def test_columns_are_exact():
    assert RESULT_COLUMNS == [
        "setup", "split", "accuracy", "median_latency_ms", "escalation_rate",
        "unanswerable_handled", "estimated_cost_per_query_usd",
    ]  # fmt: skip


def test_summary_arithmetic():
    rs = [
        res(correct=True, latency=100, tier="cheap", cost=0.002),
        res(correct=False, latency=300, tier="expensive", cost=0.004),
        res(correct=True, latency=200, tier="expensive", cost=0.006),
        res(qtype="unanswerable", correct=True, latency=50, tier="none", cost=0.0),
        res(qtype="unanswerable", correct=False, latency=60, tier="cheap", cost=0.0),
    ]
    (row,) = summarize(rs)
    assert row["setup"] == "always_cheap" and row["split"] == "train"
    assert row["accuracy"] == 0.6  # 3 of 5
    assert row["median_latency_ms"] == 100  # 50 60 100 200 300
    assert row["escalation_rate"] == 0.4  # 2 of 5 went to the expensive tier
    assert row["unanswerable_handled"] == 0.5
    assert row["estimated_cost_per_query_usd"] == 0.0024  # mean of 0.002 0.004 0.006 0 0


def test_splits_are_separate_and_ordered():
    rs = [res(split="held_out", correct=False), res(split="train", correct=True),
          res(setup="rule_router", split="train")]  # fmt: skip
    rows = summarize(rs)
    assert [(r["setup"], r["split"]) for r in rows] == [
        ("always_cheap", "train"), ("always_cheap", "held_out"), ("rule_router", "train"),
    ]  # fmt: skip
    assert rows[0]["accuracy"] == 1.0 and rows[1]["accuracy"] == 0.0


def test_empty_cells_when_not_applicable():
    (row,) = summarize([res(cost=None, latency=None)])
    assert row["unanswerable_handled"] == ""  # no unanswerable question in this split
    assert row["estimated_cost_per_query_usd"] == ""  # unpriced
    assert row["median_latency_ms"] == ""


def test_cost_of_attempts_uses_tier_prices_and_none_when_unpriced():
    prices = {"cheap": (0.5, 1.5), "expensive": (10.0, 20.0)}
    attempts = [
        {"tier": "cheap", "tokens_in": 1_000_000, "tokens_out": 2_000_000},
        {"tier": "expensive", "tokens_in": 500_000, "tokens_out": 0},
    ]
    assert cost_of(attempts, prices) == 0.5 + 3.0 + 5.0
    assert cost_of([], prices) == 0.0  # no model was called
    assert cost_of(attempts, {"cheap": (0.5, 1.5), "expensive": None}) is None
    assert cost_of([{"tier": "cheap", "tokens_in": None, "tokens_out": None}], prices) == 0.0


def test_confident_and_wrong_needs_wrong_and_high_top_score():
    rs = [
        res(correct=False, top=0.9, query="a"),
        res(correct=False, top=0.2, query="b"),
        res(correct=True, top=0.95, query="c"),
        res(correct=False, top=None, query="d"),
    ]
    assert [r.query for r in confident_wrong(rs, 0.5)] == ["a"]
