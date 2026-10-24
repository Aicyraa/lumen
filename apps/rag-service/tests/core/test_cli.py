import subprocess
import sys
from pathlib import Path

import pytest

from app import cli
from app.core import env
from app.ingest.service import ingest_file
from app.retrieval.ask import ask_chunks

SERVICE_DIR = Path(__file__).resolve().parents[2]
SECRETS = {"INTERNAL_SECRET": "s3cret-value-123", "DATABASE_URL": "postgresql://u:pw-value-456@h/d"}


@pytest.fixture
def no_env_file(monkeypatch, tmp_path):
    """Point the loader at a missing file, so the real .env never fills a variable the test removed."""
    monkeypatch.setattr(env, "ENV_FILE", tmp_path / "missing.env")


def test_env_file_is_the_apps_own_dotenv_not_the_repo_root():
    assert env.ENV_FILE == SERVICE_DIR / ".env"


def test_load_env_reads_its_file_and_existing_variables_win(monkeypatch, tmp_path):
    f = tmp_path / ".env"
    f.write_text("A_NEW_VAR=from-file\nB_SET_VAR=from-file\n# comment\n")
    monkeypatch.setattr(env, "ENV_FILE", f)
    monkeypatch.delenv("A_NEW_VAR", raising=False)
    monkeypatch.setenv("B_SET_VAR", "from-real-env")
    env.load_env()
    import os

    assert os.environ["A_NEW_VAR"] == "from-file"
    assert os.environ["B_SET_VAR"] == "from-real-env"
    monkeypatch.delenv("A_NEW_VAR")


def test_check_env_ok_prints_no_values(monkeypatch, capsys, no_env_file):
    for k, v in SECRETS.items():
        monkeypatch.setenv(k, v)
    assert cli.main(["check-env"]) == 0
    out = capsys.readouterr()
    assert "INTERNAL_SECRET" in out.out and "DATABASE_URL" in out.out
    assert not any(v in out.out + out.err for v in SECRETS.values())


def test_check_env_reports_missing_and_empty_names_only(monkeypatch, capsys, no_env_file):
    monkeypatch.delenv("INTERNAL_SECRET")
    monkeypatch.setenv("DATABASE_URL", "")
    assert cli.main(["check-env"]) == 1
    out = capsys.readouterr()
    assert "INTERNAL_SECRET" in out.out and "DATABASE_URL" in out.out
    assert "pw-value-456" not in out.out + out.err


def test_unknown_command_is_an_error(capsys):
    with pytest.raises(SystemExit) as exc:
        cli.main(["nope"])
    assert exc.value.code == 2


def test_no_command_is_an_error(capsys):
    with pytest.raises(SystemExit) as exc:
        cli.main([])
    assert exc.value.code == 2


def test_dev_uses_rag_port_with_reload(monkeypatch, no_env_file):
    import uvicorn

    seen = {}
    monkeypatch.setattr(uvicorn, "run", lambda app, **kw: seen.update(app=app, **kw))
    monkeypatch.setenv("RAG_PORT", "8123")
    assert cli.main(["dev"]) == 0
    assert (seen["app"], seen["port"], seen["reload"]) == ("app.main:app", 8123, True)


def test_dev_defaults_to_port_8000(monkeypatch, no_env_file):
    import uvicorn

    seen = {}
    monkeypatch.setattr(uvicorn, "run", lambda app, **kw: seen.update(kw))
    monkeypatch.delenv("RAG_PORT", raising=False)
    cli.main(["dev"])
    assert seen["port"] == 8000


@pytest.mark.parametrize(
    "argv, expected",
    [
        (["test", "-k", "router", "-x"], [sys.executable, "-m", "pytest", "-k", "router", "-x"]),
        (["lint"], [sys.executable, "-m", "ruff", "check", "."]),
        (["format"], [sys.executable, "-m", "ruff", "format", "."]),
    ],
)
def test_test_lint_format_run_the_tool_and_pass_extra_args(monkeypatch, argv, expected):
    calls = []
    monkeypatch.setattr(subprocess, "call", lambda cmd, **kw: calls.append((cmd, kw)) or 0)
    assert cli.main(argv) == 0
    assert calls[0][0] == expected
    assert Path(calls[0][1]["cwd"]) == SERVICE_DIR


def test_ingest_then_ask_is_scoped_to_the_tenant(tmp_path):
    f = tmp_path / "menu.md"
    f.write_text("The cafe serves espresso, flat white and cold brew every morning.")
    document_id, count = ingest_file("tenant_a", str(f))
    assert document_id and count >= 1
    assert ask_chunks("tenant_a", "which coffee drinks are served?")
    assert ask_chunks("tenant_b", "which coffee drinks are served?") == []


def test_ingest_of_a_file_without_text_stores_nothing(tmp_path):
    f = tmp_path / "empty.txt"
    f.write_text("   ")
    with pytest.raises(ValueError):
        ingest_file("tenant_a", str(f))
