import ast
import subprocess
import sys
from pathlib import Path

import pytest

from isolation.sqlstrip import StripError, make_leaky_copy, strip_tenant_predicates

APP = Path(__file__).resolve().parents[3] / "apps" / "rag-service" / "app"
STORE = (APP / "retrieval" / "store.py").read_text()


def func_source(src, name):
    node = next(n for n in ast.parse(src).body if isinstance(n, ast.FunctionDef) and n.name == name)
    return "\n".join(src.splitlines()[node.lineno - 1 : node.end_lineno])


def test_the_real_store_loses_its_retrieval_predicates_and_nothing_else():
    new, n = strip_tenant_predicates(STORE)
    assert new != STORE and n == 2
    for name in ("search", "keyword_search"):
        assert "tenant_id = %" not in func_source(new, name)
        assert "tenant_id = %" in func_source(STORE, name)
    for name in ("add_chunks", "delete_document", "filenames", "add_document"):
        assert func_source(new, name) == func_source(
            STORE, name
        )  # writes and deletes keep their filter
    ast.parse(new)  # still valid Python


def test_placeholder_count_is_unchanged_so_the_query_still_binds():
    new, _ = strip_tenant_predicates(STORE)
    for name in ("search", "keyword_search"):
        before, after = func_source(STORE, name), func_source(new, name)
        assert after.count("%s") == before.count("%s")
        assert after.count("%(tenant)s") == before.count("%(tenant)s")


def test_other_spellings_are_handled():
    src = (
        "def search(a):\n    q = 'SELECT 1 FROM chunks WHERE tenant_id=%s AND x = 1'\n"
        "def keyword_search(a):\n    q = '''SELECT 1 FROM chunks\n  WHERE x = 1 AND tenant_id   =  %(t)s'''\n"
    )
    new, n = strip_tenant_predicates(src)
    assert n == 2 and "tenant_id" not in new
    assert "%s::text IS NOT NULL" in new and "%(t)s::text IS NOT NULL" in new


def test_fails_loudly_when_nothing_matches():
    with pytest.raises(StripError):
        strip_tenant_predicates("def search():\n    return 1\n")


def test_the_leaky_copy_changes_the_file_and_imports(tmp_path):
    changed = make_leaky_copy(APP, tmp_path / "leaky")
    assert changed == 2
    copy_store = (tmp_path / "leaky" / "app" / "retrieval" / "store.py").read_text()
    assert copy_store != STORE and "__pycache__" not in {
        p.name for p in (tmp_path / "leaky" / "app").iterdir()
    }
    code = "import app, app.retrieval.store as s; print(app.__file__); print(s.__file__)"
    out = subprocess.run([sys.executable, "-c", code], cwd=tmp_path / "leaky", capture_output=True,
                         text=True, env={"PATH": "/usr/bin"}, check=True).stdout.split()  # fmt: skip
    assert all(str(tmp_path / "leaky") in line for line in out)  # the copy, not the installed app


@pytest.mark.parametrize(
    "which,stripped,kept",
    [(("search",), "search", "keyword_search"), (("keyword_search",), "keyword_search", "search")],
)
def test_a_single_predicate_can_be_stripped(which, stripped, kept):
    new, n = strip_tenant_predicates(STORE, which)
    assert n == 1
    assert "tenant_id = %" not in func_source(new, stripped)
    assert func_source(new, kept) == func_source(STORE, kept)  # the other query keeps its filter


def test_the_default_and_the_explicit_combination_are_the_same():
    assert strip_tenant_predicates(STORE) == strip_tenant_predicates(
        STORE, ("search", "keyword_search")
    )


def test_unknown_function_name_is_refused():
    with pytest.raises(StripError):
        strip_tenant_predicates(STORE, ("nope",))


def test_variant_copies_differ_from_each_other(tmp_path):
    texts = {}
    for name, which in (("v", ("search",)), ("k", ("keyword_search",)), ("all", None)):
        assert make_leaky_copy(APP, tmp_path / name, which) == (2 if which is None else 1)
        texts[name] = (tmp_path / name / "app" / "retrieval" / "store.py").read_text()
    assert len(set(texts.values())) == 3 and all(t != STORE for t in texts.values())
