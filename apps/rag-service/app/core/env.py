import os
from pathlib import Path


ENV_FILE = Path(__file__).resolve().parents[4] / ".env"  # stub: moved to the app folder next


def load_env() -> None:
    """Load KEY=VALUE lines from the repo-root .env into os.environ (existing vars win)."""
    path = ENV_FILE
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip("\"'"))
