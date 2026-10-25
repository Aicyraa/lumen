def decide(query: str, best_score: float, cfg) -> dict:
    """Pick the model tier and retrieval depth. Pure: no database, no model (brief section 7)."""
    text = query.lower()
    points = 0
    if len(text.split()) > cfg.long_query_words:
        points += 1
    if any(w in text for w in cfg.hard_words):  # substring match, as in the brief
        points += 1
    if best_score < cfg.weak_score:
        points += 2
    difficulty = min(points / 4, 1.0)
    expensive = difficulty >= cfg.escalate_at or best_score < cfg.weak_score
    return {
        "model_tier": "expensive" if expensive else "cheap",
        "k": cfg.k_expensive if expensive else cfg.k_cheap,
        "difficulty": difficulty,
        # escalated = sent to the expensive tier out of caution, not because it is clearly hard
        "escalated": expensive and difficulty < cfg.hard_at,
    }
