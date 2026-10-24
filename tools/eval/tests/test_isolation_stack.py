import pytest
from isolation.stack import StackError, derive_urls, scratch_name

DEV = "postgresql://postgres:s3cret@localhost:5433/lumen"


def test_scratch_name_has_the_prefix_and_a_timestamp():
    n = scratch_name(1_700_000_000)
    assert n.startswith("lumen_isolation_") and n[len("lumen_isolation_") :].isdigit()


def test_urls_keep_credentials_but_change_the_database():
    admin, scratch = derive_urls(DEV, "lumen_isolation_1")
    assert admin.endswith("/postgres") and scratch.endswith("/lumen_isolation_1")
    assert "s3cret" in scratch and "5433" in scratch


def test_refuses_a_remote_database():
    with pytest.raises(StackError, match="local"):
        derive_urls("postgresql://u:p@db.example.supabase.co:5432/postgres", "lumen_isolation_1")


def test_refuses_names_outside_the_prefix():
    with pytest.raises(StackError):
        derive_urls(DEV, "lumen")


def test_drop_statement_only_for_scratch_names():
    from isolation.stack import drop_statement

    assert drop_statement("lumen_isolation_1") == 'DROP DATABASE IF EXISTS "lumen_isolation_1" WITH (FORCE)'
    for bad in ("keyword", "lumen", 'lumen_isolation_1"; DROP DATABASE lumen; --'):
        with pytest.raises(StackError):
            drop_statement(bad)
