from pathlib import Path

from app.ingest.chunking import chunk
from app.ingest.extract import extract_text
from app.retrieval.embeddings import embed
from app.retrieval.store import add_chunks, add_document


def ingest_file(tenant_id: str, file: str) -> tuple[str, int]:
    """Extract, chunk, embed and store one .txt, .md or .pdf for a tenant; returns (document_id, chunks)."""
    chunks = chunk(extract_text(file))
    if not chunks:
        raise ValueError("no text extracted")
    document_id = add_document(tenant_id, Path(file).name)
    add_chunks(tenant_id, document_id, chunks, embed(chunks))
    return document_id, len(chunks)
