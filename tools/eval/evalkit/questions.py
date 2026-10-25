"""Read tools/eval/questions.csv. The header must match exactly; the human columns may be empty."""

import csv
from dataclasses import dataclass
from pathlib import Path

HEADER = [
    "query", "tenant", "domain", "type", "expected_answer", "source_doc",
    "held_out", "cheap_ok", "expensive_ok",
]  # fmt: skip
TYPES = {"easy", "hard", "multi-document", "unanswerable"}
_TRUE, _FALSE = {"true", "1", "yes"}, {"false", "0", "no"}


class QuestionsError(ValueError):
    pass


@dataclass(frozen=True)
class Question:
    query: str
    tenant: str
    domain: str
    type: str
    expected_answer: str
    source_doc: str
    held_out: bool
    cheap_ok: str
    expensive_ok: str


def split_of(q: Question) -> str:
    return "held_out" if q.held_out else "train"  # an empty held_out cell counts as train


def load_questions(path) -> list[Question]:
    with Path(path).open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        header = next(reader, [])
        if header != HEADER:
            raise QuestionsError(f"questions header must be exactly: {','.join(HEADER)}")
        out = []
        for n, row in enumerate(reader, 2):
            if not any(row):
                continue
            if len(row) != len(HEADER):
                raise QuestionsError(f"line {n}: expected {len(HEADER)} columns, got {len(row)}")
            d = dict(zip(HEADER, (c.strip() for c in row)))
            if d["type"] not in TYPES:
                raise QuestionsError(f"line {n}: type must be one of {sorted(TYPES)}")
            flag = d["held_out"].lower()
            if flag and flag not in _TRUE | _FALSE:
                raise QuestionsError(f"line {n}: held_out must be true, false or empty")
            d["held_out"] = flag in _TRUE
            out.append(Question(**d))
    return out
