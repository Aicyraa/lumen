import pytest
from fastapi.testclient import TestClient

from app.api.factory import create_app

DOC_PATHS = ["/docs", "/redoc", "/openapi.json"]


@pytest.mark.parametrize("path", DOC_PATHS)
def test_interactive_docs_are_off_in_production(monkeypatch, path):
    # the service may sit on a public URL: its schema must not be advertised
    monkeypatch.setenv("NODE_ENV", "production")
    assert TestClient(create_app()).get(path).status_code == 404


def test_docs_stay_on_in_development(monkeypatch):
    monkeypatch.setenv("NODE_ENV", "development")
    assert TestClient(create_app()).get("/openapi.json").status_code == 200
