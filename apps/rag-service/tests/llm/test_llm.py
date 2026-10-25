import json

import pytest

from app.llm.prompt import build_prompt


def test_prompt_numbers_the_passages_and_marks_them_untrusted():
    system, user = build_prompt("When do you open?", ["first passage", "second passage"])
    assert "untrusted" in system and "I could not find that in the documents." in system
    assert user == "Passages:\n[1] first passage\n[2] second passage\n\nQuestion: When do you open?"


def test_answer_renders_only_verified_passage_numbers_with_ascii_citations():
    from app.llm.prompt import render_answer

    raw = json.dumps(
        {
            "claims": [
                {
                    "text": "Admission does not guarantee housing.",
                    "evidence": [{"passage": 2, "quote": "admission does not guarantee housing"}],
                },
                {
                    "text": "A room costs PHP 4,500.",
                    "evidence": [
                        {"passage": 1, "quote": "PHP 4,500 per month"},
                        {"passage": 2, "quote": "PHP 4,500 per month"},
                    ],
                },
            ]
        }
    )
    answer = render_answer(
        raw,
        ["PHP 4,500 per month", "PHP 4,500 per month; admission does not guarantee housing"],
        "Not found",
    )
    assert answer == "Admission does not guarantee housing. [2]\n\nA room costs PHP 4,500. [1][2]"


@pytest.mark.parametrize(
    "evidence",
    [
        [],
        [{"passage": 0, "quote": "No guarantee"}],
        [{"passage": 2, "quote": "No guarantee"}],
        [{"passage": True, "quote": "No guarantee"}],
        [{"passage": 1, "quote": ""}],
        [{"passage": 1, "quote": "Housing is guaranteed"}],
    ],
)
def test_answer_rejects_missing_fabricated_or_wrong_passage_evidence(evidence):
    from app.llm.prompt import render_answer

    raw = json.dumps({"claims": [{"text": "A claim", "evidence": evidence}]})
    with pytest.raises(ValueError):
        render_answer(raw, ["No guarantee"], "Not found")


@pytest.mark.parametrize(
    "raw",
    [
        '{"claims": []}',
        "I could not find that in the documents.",
        "I’m sorry, but I can’t help with that.",
    ],
)
def test_empty_answer_and_plain_refusals_use_the_configured_not_found_message(raw):
    from app.llm.prompt import render_answer

    assert render_answer(raw, ["A passage"], "Not found") == "Not found"


def test_quote_validation_allows_pdf_whitespace_but_not_invented_text():
    from app.llm.prompt import render_answer

    raw = json.dumps(
        {"claims": [{"text": "A fact", "evidence": [{"passage": 1, "quote": "written approval"}]}]}
    )
    assert render_answer(raw, ["Requires written\n  approval."], "Not found") == "A fact [1]"


def test_quote_validation_allows_equivalent_pdf_hyphens_and_quotes():
    from app.llm.prompt import render_answer

    raw = json.dumps(
        {
            "claims": [
                {
                    "text": "INT-027 lasts 12 weeks",
                    "evidence": [{"passage": 1, "quote": "INT‑027: ‘12 weeks’"}],
                }
            ]
        }
    )
    assert render_answer(raw, ["INT-027: '12 weeks'"], "Not found") == "INT-027 lasts 12 weeks [1]"


@pytest.mark.parametrize("text", ["A fact 【1】", "A fact [1]", "A fact ［1］"])
def test_model_cannot_embed_its_own_citation_markers_in_claim_text(text):
    from app.llm.prompt import render_answer

    raw = json.dumps({"claims": [{"text": text, "evidence": [{"passage": 1, "quote": "A fact"}]}]})
    with pytest.raises(ValueError):
        render_answer(raw, ["A fact"], "Not found")


def test_non_text_model_output_is_a_validation_error():
    from app.llm.prompt import render_answer

    with pytest.raises(ValueError):
        render_answer(None, ["A fact"], "Not found")


def test_misnumbered_quote_is_reassigned_only_when_one_passage_contains_it():
    from app.llm.prompt import render_answer

    raw = json.dumps(
        {
            "claims": [
                {
                    "text": "No guarantee",
                    "evidence": [{"passage": 1, "quote": "Admission does not guarantee housing"}],
                }
            ]
        }
    )
    assert (
        render_answer(raw, ["Room price", "Admission does not guarantee housing"], "Not found")
        == "No guarantee [2]"
    )
    with pytest.raises(ValueError):
        render_answer(
            raw,
            [
                "Room price",
                "Admission does not guarantee housing",
                "Admission does not guarantee housing",
            ],
            "Not found",
        )


@pytest.mark.parametrize(
    "text",
    [
        "The serial numbers are not listed in the documents.",
        "The corpus does not state the application count.",
    ],
)
def test_claims_that_only_describe_missing_document_information_use_not_found(text):
    from app.llm.prompt import render_answer

    raw = json.dumps({"claims": [{"text": text, "evidence": [{"passage": 1, "quote": text}]}]})
    assert render_answer(raw, [text], "Not found") == "Not found"


def test_known_negative_policy_is_not_mistaken_for_missing_information():
    from app.llm.prompt import render_answer

    text = "Housing is not provided."
    raw = json.dumps({"claims": [{"text": text, "evidence": [{"passage": 1, "quote": text}]}]})
    assert render_answer(raw, [text], "Not found") == "Housing is not provided. [1]"


def raw_claim(quote, passage=1):
    return json.dumps(
        {"claims": [{"text": "A claim.", "evidence": [{"passage": passage, "quote": quote}]}]}
    )


PASSAGE = "The library opens at nine and closes at five on weekdays."


def test_one_word_quote_is_rejected_even_though_it_is_in_the_passage():
    from app.llm.prompt import render_answer

    with pytest.raises(ValueError):
        render_answer(raw_claim("The"), [PASSAGE], "Not found")


def test_short_quote_under_min_chars_is_rejected():
    from app.llm.prompt import render_answer

    with pytest.raises(ValueError):
        render_answer(raw_claim("at nine"), [PASSAGE], "Not found")  # 2 words but 7 characters


def test_a_real_quote_passes():
    from app.llm.prompt import render_answer

    answer = render_answer(raw_claim("opens at nine and closes at five"), [PASSAGE], "Not found")
    assert answer == "A claim. [1]"


def test_a_short_whole_passage_may_be_quoted_whole():
    from app.llm.prompt import render_answer

    assert render_answer(raw_claim("Closed"), ["Closed"], "Not found") == "A claim. [1]"


def test_quote_limits_come_from_config(monkeypatch):
    from app.core.config import load_config
    from app.llm.prompt import render_answer

    monkeypatch.setitem(load_config()["llm"], "min_quote_chars", 1)
    monkeypatch.setitem(load_config()["llm"], "min_quote_words", 1)
    assert render_answer(raw_claim("nine"), [PASSAGE], "Not found") == "A claim. [1]"
