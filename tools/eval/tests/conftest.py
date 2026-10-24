import pytest
from fakes import FakeServer


@pytest.fixture
def server():
    made = []

    def make(handler):
        s = FakeServer(handler)
        made.append(s)
        return s

    yield make
    for s in made:
        s.close()


@pytest.fixture(autouse=True)
def no_sleep(monkeypatch):
    """Backoff never really sleeps in tests; the requested delays are recorded."""
    slept = []
    monkeypatch.setattr("evalkit.http.sleep", slept.append)
    return slept
