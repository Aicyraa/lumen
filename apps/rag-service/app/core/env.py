import os
from pathlib import Path

# the app reads only its own .env (plus the real environment); never a repo-root file
ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


def load_env() -> None:
    """Load KEY=VALUE lines from apps/rag-service/.env into os.environ (existing vars win)."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
