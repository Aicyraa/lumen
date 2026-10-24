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
