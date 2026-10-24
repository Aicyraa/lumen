from app.retrieval.embeddings import embed
from app.retrieval.store import search


def ask_chunks(tenant_id: str, question: str, k: int = 3) -> list:
    """Top-k (chunk_id, document_id, content, score) for the tenant; no LLM call."""
    return search(tenant_id, embed([question])[0], k)
