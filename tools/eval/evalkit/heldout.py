"""The documented rule that picks the held-out rows, fixed before any system answer is seen."""

import random

SEED = 20261024
QUOTA = {"easy": 3, "hard": 3, "multi-document": 2, "unanswerable": 2}  # about a quarter of 43 rows


def pick_held_out(rows) -> set[str]:
    """Per type: take the rows in file order, shuffle with Random(f"{SEED}:{type}"), keep the first QUOTA[type]."""
    picked = set()
    for t, k in QUOTA.items():
        queries = [r["query"] for r in rows if r["type"] == t]
        random.Random(f"{SEED}:{t}").shuffle(queries)
        picked.update(queries[:k])
    return picked
