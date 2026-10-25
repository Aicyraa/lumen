import ast
import shutil
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
    assert new != STORE and n == 6  # dense 1, BM25 4 (one per CTE), filenames 1
    for name in ("dense_search", "keyword_search", "filenames"):
        assert "tenant_id = %" not in func_source(new, name)
        assert "tenant_id = %" in func_source(STORE, name)
    assert func_source(new, "search") == func_source(STORE, "search")  # it only delegates
    for name in ("add_chunks", "delete_document", "document_status", "add_document"):
        assert func_source(new, name) == func_source(
            STORE, name
        )  # writes and deletes keep their filter
    ast.parse(new)  # still valid Python


def test_placeholder_count_is_unchanged_so_the_query_still_binds():
    new, _ = strip_tenant_predicates(STORE)
    for name in ("dense_search", "keyword_search", "filenames"):
        before, after = func_source(STORE, name), func_source(new, name)
        assert after.count("%s") == before.count("%s")
        assert after.count("%(tenant)s") == before.count("%(tenant)s")


def test_other_spellings_are_handled():
    src = (
        "def dense_search(a):\n    q = 'SELECT 1 FROM chunks WHERE tenant_id=%s AND x = 1'\n"
        "def keyword_search(a):\n    q = '''SELECT 1 FROM chunks\n  WHERE x = 1 AND tenant_id   =  %(t)s'''\n"
        "def filenames(a):\n    q = 'WHERE tenant_id = %s'\n"
    )
    new, n = strip_tenant_predicates(src)
    assert n == 3 and "tenant_id" not in new
    assert "%s::text IS NOT NULL" in new and "%(t)s::text IS NOT NULL" in new


def test_an_aliased_predicate_leaves_no_dangling_alias():
    src = "def keyword_search(a):\n    q = 'FROM chunks c WHERE c.tenant_id = %(t)s AND x'\n"
    new, n = strip_tenant_predicates(src, ("keyword_search",))
    assert n == 1 and "c.%" not in new and "WHERE %(t)s::text IS NOT NULL" in new


def test_fails_loudly_when_nothing_matches():
    with pytest.raises(StripError):
        strip_tenant_predicates("def search():\n    return 1\n")


def test_the_leaky_copy_changes_the_file_and_imports(tmp_path):
    changed = make_leaky_copy(APP, tmp_path / "leaky")
    assert changed == 6
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
    [
        (("dense_search",), "dense_search", "keyword_search"),
        (("keyword_search",), "keyword_search", "dense_search"),
        (("filenames",), "filenames", "dense_search"),  # a leak through filenames is stripped too
    ],
)
def test_a_single_predicate_can_be_stripped(which, stripped, kept):
    new, n = strip_tenant_predicates(STORE, which)
    assert n == (4 if stripped == "keyword_search" else 1)
    assert "tenant_id = %" not in func_source(new, stripped)
    assert func_source(new, kept) == func_source(STORE, kept)  # the other query keeps its filter


def test_the_default_and_the_explicit_combination_are_the_same():
    assert strip_tenant_predicates(STORE) == strip_tenant_predicates(
        STORE, ("dense_search", "keyword_search", "filenames")
    )


def test_unknown_function_name_is_refused():
    with pytest.raises(StripError):
        strip_tenant_predicates(STORE, ("nope",))


def test_variant_copies_differ_from_each_other(tmp_path):
    texts = {}
    for name, which in (("v", ("dense_search",)), ("k", ("keyword_search",)), ("all", None)):
        assert make_leaky_copy(APP, tmp_path / name, which) == {None: 6, ("dense_search",): 1}.get(
            which, 4
        )
        texts[name] = (tmp_path / name / "app" / "retrieval" / "store.py").read_text()
    assert len(set(texts.values())) == 3 and all(t != STORE for t in texts.values())


def test_the_copy_links_models_instead_of_copying_or_losing_them(tmp_path):
    app = tmp_path / "app"
    shutil.copytree(APP, app, ignore=shutil.ignore_patterns("models", "__pycache__"))
    real = tmp_path / "weights"
    (real / "embedding").mkdir(parents=True)
    (real / "embedding" / "w.bin").write_text("x")
    (app / "models").symlink_to(
        real
    )  # as in a worktree, where models/ is a link to the main checkout
    make_leaky_copy(app, tmp_path / "leaky")
    link = tmp_path / "leaky" / "app" / "models"
    assert link.is_symlink() and link.resolve() == real.resolve()
    assert (link / "embedding" / "w.bin").read_text() == "x"


def test_a_checkout_without_models_still_copies(tmp_path):
    app = tmp_path / "app"
    shutil.copytree(APP, app, ignore=shutil.ignore_patterns("models", "__pycache__"))
    make_leaky_copy(app, tmp_path / "leaky")
    assert not (tmp_path / "leaky" / "app" / "models").exists()
