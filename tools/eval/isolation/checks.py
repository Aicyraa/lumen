"""Pure checkers: each takes a response and returns Findings (empty list = fine).
Leaks: foreign_source, foreign_marker, foreign_row. Problems (the suite could not verify): bad_status,
not_404, positive_missing_code, positive_missing_source."""

import json
from dataclasses import dataclass


@dataclass(frozen=True)
class Finding:
    kind: str
    detail: str


LEAK_KINDS = {"foreign_source", "foreign_marker", "foreign_row", "not_404"}


def _markers_in(text: str, markers) -> list[str]:
    low = text.lower()
    return [m for m in markers if m.lower() in low]


def check_chat(resp, own_doc_ids, foreign_markers) -> list[Finding]:
    """A /v1/chat reply: 200, every source document is the caller's, no foreign marker anywhere."""
    if resp.status != 200 or not isinstance(resp.body, dict):
        return [Finding("bad_status", f"HTTP {resp.status} (expected a JSON 200)")]
    out = []
    for s in resp.body.get("sources") or []:
        if s.get("document_id") not in own_doc_ids:
            out.append(
                Finding(
                    "foreign_source", f"source document {s.get('document_id')} is not the caller's"
                )
            )
    out += [
        Finding("foreign_marker", f"{m!r} appears in the response")
        for m in _markers_in(resp.text, foreign_markers)
    ]
    return out


def check_positive(resp, own_code, expected_doc) -> list[Finding]:
    """The tenant's own planted data must come back: the code word (when expected) and the document."""
    if resp.status != 200 or not isinstance(resp.body, dict):
        return [Finding("bad_status", f"HTTP {resp.status} (expected a JSON 200)")]
    out = []
    if own_code and own_code.lower() not in str(resp.body.get("answer", "")).lower():
        out.append(Finding("positive_missing_code", f"{own_code!r} not in the answer"))
    if expected_doc not in {s.get("document_id") for s in resp.body.get("sources") or []}:
        out.append(Finding("positive_missing_source", "the own document was not retrieved"))
    return out


def check_not_found(resp, what) -> list[Finding]:
    """A foreign object must look like a missing one: 404 with the not_found code (never 403, never 200)."""
    err = resp.body.get("error") if isinstance(resp.body, dict) else None
    code = err.get("code") if isinstance(err, dict) else None
    if resp.status == 404 and code == "not_found":
        return []
    return [Finding("not_404", f"{what}: HTTP {resp.status} code={code!r}, expected 404 not_found")]


def check_no_foreign_rows(where, payload, foreign_ids, foreign_markers) -> list[Finding]:
    """A dashboard payload must not mention the other tenant's ids or markers."""
    text = json.dumps(payload)
    hits = [i for i in foreign_ids if i and i in text] + _markers_in(text, foreign_markers)
    return [Finding("foreign_row", f"{where}: shows {h!r}") for h in hits]
