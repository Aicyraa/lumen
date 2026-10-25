import logging

import pytest
from fastapi.testclient import TestClient

from app.core import logging as lumen_logging
from tests.api.test_api_ingest import LONG_TEXT, post
from tests.conftest import AUTH, add_document


@pytest.fixture(autouse=True)
def reset_logger():
    logger = logging.getLogger("lumen.rag")
    saved = logger.level
    logger.setLevel(logging.NOTSET)
    yield logger
    logger.setLevel(saved)


def test_default_level_is_info(monkeypatch, reset_logger):
    monkeypatch.delenv("LOG_LEVEL", raising=False)
    lumen_logging.configure_logging()
    assert reset_logger.getEffectiveLevel() == logging.INFO


@pytest.mark.parametrize("value, level", [("WARNING", logging.WARNING), ("debug", logging.DEBUG)])
def test_level_comes_from_log_level(monkeypatch, reset_logger, value, level):
    monkeypatch.setenv("LOG_LEVEL", value)
    lumen_logging.configure_logging()
    assert reset_logger.getEffectiveLevel() == level


def test_an_unknown_level_falls_back_to_info(monkeypatch, reset_logger):
    monkeypatch.setenv("LOG_LEVEL", "loud")
    lumen_logging.configure_logging()
    assert reset_logger.getEffectiveLevel() == logging.INFO


def test_service_startup_configures_logging(reset_logger):
    from app import main

    with TestClient(main.app):
        assert reset_logger.getEffectiveLevel() == logging.INFO


def test_format_is_one_line_even_for_a_message_with_newlines():
    record = logging.LogRecord("lumen.rag", logging.INFO, "f", 1, "a\nb %s", ("c\r\nd",), None)
    line = lumen_logging.formatter().format(record)
    assert "\n" not in line and "\r" not in line
    assert "level=INFO" in line and "logger=lumen.rag" in line


def test_ingest_and_query_lines_are_emitted_without_secrets_or_text(client, llm, caplog):
    caplog.set_level(logging.INFO, logger="lumen.rag")
    doc = add_document("tenant_a", "notes.txt")
    assert post(client, "tenant_a", doc).status_code == 200
    question = "What does word7 mean in the notes?"
    resp = client.post(
        "/internal/query",
        headers=AUTH,
        json={
            "tenant_id": "tenant_a",
            "query": question,
            "models": {
                "cheap": [
                    {
                        "provider": "openai_compatible",
                        "model_id": "m1",
                        "endpoint_url": "https://example.com/v1",
                        "api_key": "sk-super-secret-key",
                    }
                ]
            },
        },
    )
    assert resp.status_code == 200
    text = caplog.text
    assert "ingested tenant=tenant_a" in text and "query tenant=tenant_a" in text
    assert all(r.name == "lumen.rag" for r in caplog.records if "ingested" in r.message)
    for secret in ("sk-super-secret-key", "word7", question, "test-secret", LONG_TEXT[:40]):
        assert secret not in text
