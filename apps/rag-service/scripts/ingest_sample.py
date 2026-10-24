"""Usage: python scripts/ingest_sample.py <tenant_id> <file>  (.txt, .md or .pdf)"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.env import load_env

load_env()  # DATABASE_URL from the repo-root .env

from app.ingest.chunking import chunk
from app.retrieval.embeddings import embed
from app.ingest.extract import extract_text
from app.retrieval.store import add_chunks, add_document


def main(tenant_id: str, file: str) -> None:
    chunks = chunk(extract_text(file))
    if not chunks:
        sys.exit("no text extracted")
    document_id = add_document(tenant_id, Path(file).name)
    add_chunks(tenant_id, document_id, chunks, embed(chunks))
    print(f"document {document_id}: {len(chunks)} chunks stored for tenant {tenant_id}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
