from app.config import router_cfg
from app.router import decide

CFG = router_cfg()
STRONG = 0.60  # a good match: above weak_score, so only the wording can add points


def test_easy_question_goes_cheap():
    r = decide("What time does the cafe open?", STRONG, CFG)
    assert r == {"model_tier": "cheap", "k": CFG.k_cheap, "difficulty": 0.0, "escalated": False}


def test_long_question_is_escalated_out_of_caution():
    query = " ".join(["word"] * (CFG.long_query_words + 1))
    r = decide(query, STRONG, CFG)
    assert (r["model_tier"], r["k"], r["difficulty"]) == ("expensive", CFG.k_expensive, 0.25)
    assert r["escalated"] is True  # difficulty 0.25 is below hard_at


def test_exactly_long_query_words_is_not_long():
    query = " ".join(["word"] * CFG.long_query_words)
    assert decide(query, STRONG, CFG)["model_tier"] == "cheap"


def test_hard_word_is_escalated():
    r = decide("Can you compare the two plans?", STRONG, CFG)
    assert (r["model_tier"], r["difficulty"], r["escalated"]) == ("expensive", 0.25, True)


def test_weak_score_goes_expensive_and_is_clearly_hard():
    r = decide("What time does the cafe open?", 0.20, CFG)  # above no_answer_score, below weak_score
    assert (r["model_tier"], r["k"], r["difficulty"]) == ("expensive", CFG.k_expensive, 0.5)
    assert r["escalated"] is False  # difficulty 0.5 reaches hard_at


def test_several_hard_words_add_only_one_point():
    r = decide("Why is it closed? Compare both days, unless it is an exception", 0.20, CFG)
    assert r["difficulty"] == 0.75 and r["escalated"] is False


def test_score_exactly_at_weak_score_is_not_weak():
    assert decide("What time does the cafe open?", CFG.weak_score, CFG)["model_tier"] == "cheap"
