import pytest

from evalkit.questions import HEADER, QuestionsError, load_questions, split_of

GOOD = ",".join(HEADER) + "\n"


def write(tmp_path, body, header=GOOD):
    p = tmp_path / "q.csv"
    p.write_text(header + body, encoding="utf-8")
    return p


def test_header_must_match_exactly(tmp_path):
    bad = ",".join(reversed(HEADER)) + "\n"
    with pytest.raises(QuestionsError, match="header"):
        load_questions(write(tmp_path, "", bad))
    with pytest.raises(QuestionsError, match="header"):
        load_questions(write(tmp_path, "", ",".join(HEADER[:-1]) + "\n"))


def test_rows_parse_and_empty_held_out_is_train(tmp_path):
    body = (
        "q1,Lumen,d,easy,A1,doc.pdf,,,\n"
        "q2,Lumen,d,hard,A2,doc.pdf,TRUE,,\n"
        "q3,Lumen,d,hard,,doc.pdf,false,,\n"
    )
    qs = load_questions(write(tmp_path, body))
    assert [split_of(q) for q in qs] == ["train", "held_out", "train"]
    assert [q.expected_answer for q in qs] == ["A1", "A2", ""]


def test_bad_held_out_value_is_an_error(tmp_path):
    with pytest.raises(QuestionsError, match="held_out"):
        load_questions(write(tmp_path, "q1,Lumen,d,easy,A1,doc.pdf,maybe,,\n"))


def test_bad_type_is_an_error(tmp_path):
    with pytest.raises(QuestionsError, match="type"):
        load_questions(write(tmp_path, "q1,Lumen,d,weird,A1,doc.pdf,,,\n"))
