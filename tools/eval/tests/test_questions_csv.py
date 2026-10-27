import csv
from pathlib import Path

HEADER = [
    "query", "tenant", "domain", "type", "expected_answer", "source_doc",
    "held_out", "cheap_ok", "expensive_ok",
]  # fmt: skip
CSV = Path(__file__).resolve().parents[1] / "questions.csv"
PDFS = {
    "01_university_and_admissions.pdf", "02_scholarships_and_financial_aid.pdf",
    "03_careers_and_global_opportunities.pdf", "04_research_and_entrepreneurship.pdf",
    "05_student_life_and_support.pdf", "06_awards_policy_and_exceptions.pdf",
    "07_global_and_career_program_handbook.pdf", "08_research_facilities_and_access.pdf",
}  # fmt: skip


def rows():
    with CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == HEADER
        return list(reader)


def test_header_and_size():
    assert 36 <= len(rows()) <= 50


def test_agent_drafted_answers_and_the_documented_held_out_rule():
    """AGENT-DRAFTED, unverified by the human (they were drafted from the source PDFs only)."""
    from evalkit.heldout import pick_held_out

    rs = rows()
    picked = pick_held_out(rs)
    for r in rs:
        assert r["expected_answer"].strip(), r["query"]
        assert r["held_out"] == ("true" if r["query"] in picked else "false"), r["query"]
        assert r["cheap_ok"] == "" and r["expensive_ok"] == ""
        if r["type"] == "unanswerable":
            assert r["expected_answer"] == "I could not find that in the documents."
    assert sum(r["held_out"] == "true" for r in rs) == 10


def test_types_and_sources():
    rs = rows()
    types = {r["type"] for r in rs}
    assert types == {"easy", "hard", "multi-document", "unanswerable"}
    assert sum(r["type"] == "unanswerable" for r in rs) >= 6
    for r in rs:
        docs = [d for d in r["source_doc"].split(";") if d]
        assert set(docs) <= PDFS, r["query"]
        if r["type"] == "unanswerable":
            assert docs == []
        elif r["type"] == "multi-document":
            assert len(docs) >= 2
        else:
            assert len(docs) == 1


def test_queries_unique_and_filled():
    qs = [r["query"] for r in rows()]
    assert all(q.strip() for q in qs) and len(set(qs)) == len(qs)
    assert all(r["tenant"] and r["domain"] for r in rows())
