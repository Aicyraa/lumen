"""Negative control: copy the rag-service app and remove the tenant_id predicates from its retrieval queries."""

import ast
import re
import shutil
from pathlib import Path

RETRIEVAL_FUNCTIONS = (
    "search",
    "keyword_search",
)  # the dense/fused search and BM25 (the probe uses search)
# `tenant_id = %s` or `tenant_id = %(name)s`, any spacing. Replaced by a placeholder test that is always true,
# so the parameter list and the SQL stay valid and only the filter is gone.
PREDICATE = re.compile(r"tenant_id\s*=\s*(%\(\w+\)s|%s)")


class StripError(Exception):
    pass


def strip_tenant_predicates(source: str) -> tuple[str, int]:
    """Returns (new source, number of predicates removed). Raises when the code no longer looks as expected."""
    lines = source.splitlines(keepends=True)
    total = 0
    funcs = [
        n
        for n in ast.parse(source).body
        if isinstance(n, ast.FunctionDef) and n.name in RETRIEVAL_FUNCTIONS
    ]
    if {f.name for f in funcs} != set(RETRIEVAL_FUNCTIONS):
        raise StripError(f"store.py no longer defines {RETRIEVAL_FUNCTIONS}")
    for f in sorted(
        funcs, key=lambda f: -f.lineno
    ):  # bottom first, so earlier line numbers stay valid
        seg = "".join(lines[f.lineno - 1 : f.end_lineno])
        new, n = PREDICATE.subn(r"\1::text IS NOT NULL", seg)
        if n == 0:
            raise StripError(f"no tenant_id predicate found in {f.name}")
        lines[f.lineno - 1 : f.end_lineno] = [new]
        total += n
    return "".join(lines), total


def make_leaky_copy(app_dir: Path, dest: Path) -> int:
    """Copy `app_dir` (apps/rag-service/app) to dest/app and strip the predicates; returns how many."""
    target = dest / "app"
    shutil.copytree(app_dir, target, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    store = target / "retrieval" / "store.py"
    original = store.read_text()
    new, n = strip_tenant_predicates(original)
    if new == original:
        raise StripError("the copy was not changed")
    store.write_text(new)
    return n
