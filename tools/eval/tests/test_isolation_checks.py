import json

from isolation.checks import (
    check_chat,
    check_no_foreign_rows,
    check_not_found,
    check_positive,
)

from evalkit.http import HttpResult

OWN = {"own-1", "own-2"}
FOREIGN_MARKERS = ["COBALTOWL-9082", "Cobalt Marine Supply"]


def chat(body, status=200):
    return HttpResult(status, {}, body, json.dumps(body))


def ok(answer="Fine.", sources=()):
    return chat({"request_id": "r", "answer": answer, "route": {"model_tier": "cheap"},
                 "sources": [{"document_id": d, "chunk_id": 1, "score": 0.5} for d in sources]})  # fmt: skip


def kinds(findings):
    return sorted({f.kind for f in findings})


def test_clean_answer_has_no_findings():
    assert check_chat(ok("Hours are 6 AM.", ["own-1"]), OWN, FOREIGN_MARKERS) == []
    assert check_chat(ok("I could not find that in the documents."), OWN, FOREIGN_MARKERS) == []


def test_foreign_source_is_a_leak():
    f = check_chat(ok(sources=["own-1", "other-9"]), OWN, FOREIGN_MARKERS)
    assert kinds(f) == ["foreign_source"] and "other-9" in f[0].detail


def test_foreign_code_word_anywhere_in_the_response_is_a_leak():
    assert kinds(check_chat(ok("The code is COBALTOWL-9082."), OWN, FOREIGN_MARKERS)) == [
        "foreign_marker"
    ]
    body = {
        "request_id": "r",
        "answer": "x",
        "sources": [],
        "route": {"note": "cobalt marine supply"},
    }
    assert kinds(check_chat(chat(body), OWN, FOREIGN_MARKERS)) == [
        "foreign_marker"
    ]  # case-insensitive, any field


def test_non_200_is_a_problem_not_a_leak():
    f = check_chat(chat({"error": {"code": "x"}}, 502), OWN, FOREIGN_MARKERS)
    assert kinds(f) == ["bad_status"]


def test_malformed_body_is_a_problem():
    assert kinds(check_chat(HttpResult(200, {}, None, "oops"), OWN, FOREIGN_MARKERS)) == [
        "bad_status"
    ]


def test_positive_needs_the_own_code_word_and_own_source():
    good = ok("Code word: AMBERFOX-4417.", ["own-1"])
    assert check_positive(good, OWN, "AMBERFOX-4417", expected_doc="own-1") == []
    nothing = ok("I could not find that in the documents.")
    assert kinds(check_positive(nothing, OWN, "AMBERFOX-4417", expected_doc="own-1")) == [
        "positive_missing_code", "positive_missing_source",
    ]  # fmt: skip
    wrong_doc = ok("Code word: AMBERFOX-4417.", ["own-2"])
    assert kinds(check_positive(wrong_doc, OWN, "AMBERFOX-4417", expected_doc="own-1")) == [
        "positive_missing_source"
    ]
    # a fact question has no code word to find
    assert check_positive(ok("Open 6 AM", ["own-2"]), OWN, None, expected_doc="own-2") == []


def test_not_found_check_wants_404_with_the_not_found_code():
    good = HttpResult(404, {}, {"error": {"code": "not_found", "message": "m"}}, "")
    assert check_not_found(good, "GET foreign document") == []
    assert kinds(
        check_not_found(HttpResult(403, {}, {"error": {"code": "forbidden"}}, ""), "x")
    ) == ["not_404"]
    assert kinds(check_not_found(HttpResult(200, {}, {"document_id": "d"}, ""), "x")) == ["not_404"]
    assert kinds(check_not_found(HttpResult(404, {}, {"error": {"code": "other"}}, ""), "x")) == [
        "not_404"
    ]


def test_dashboard_payload_must_not_hold_foreign_ids_or_markers():
    clean = {"documents": [{"document_id": "own-1", "filename": "a.txt"}]}
    assert check_no_foreign_rows("documents", clean, ["other-9"], FOREIGN_MARKERS) == []
    dirty = {"documents": [{"document_id": "other-9", "filename": "cobalt_x.txt"}]}
    assert kinds(check_no_foreign_rows("documents", dirty, ["other-9"], FOREIGN_MARKERS)) == [
        "foreign_row"
    ]
    q = {"items": [{"query": "show Cobalt Marine Supply"}]}
    assert kinds(check_no_foreign_rows("requests", q, [], FOREIGN_MARKERS)) == ["foreign_row"]
