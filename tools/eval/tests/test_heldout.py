from evalkit.heldout import QUOTA, SEED, pick_held_out


def rows():
    types = ["easy"] * 13 + ["hard"] * 12 + ["multi-document"] * 9 + ["unanswerable"] * 9
    return [{"query": f"q{i}", "type": t} for i, t in enumerate(types)]


def test_quota_per_type_and_total():
    picked = pick_held_out(rows())
    by_type = {}
    for r in rows():
        by_type[r["type"]] = by_type.get(r["type"], 0) + (r["query"] in picked)
    assert by_type == QUOTA == {"easy": 3, "hard": 3, "multi-document": 2, "unanswerable": 2}
    assert len(picked) == 10 and SEED == 20261024


def test_deterministic_and_independent_of_other_types():
    assert pick_held_out(rows()) == pick_held_out(rows())
    fewer = [r for r in rows() if r["type"] != "hard"]
    easy = {r["query"] for r in rows() if r["type"] == "easy"}
    assert pick_held_out(fewer) & easy == pick_held_out(rows()) & easy  # per-type shuffle
