"""Usage: python scripts/ask.py <tenant_id> "<question>"  (prints the top 3 chunks, no LLM)"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.env import load_env

load_env()

from app.retrieval.embeddings import embed
from app.retrieval.store import search


def main(tenant_id: str, question: str) -> None:
    for rank, (chunk_id, _doc, content, score) in enumerate(search(tenant_id, embed([question])[0], 3), 1):
        print(f"#{rank} score={score:.3f} chunk={chunk_id}\n    {content[:200]}...\n")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
