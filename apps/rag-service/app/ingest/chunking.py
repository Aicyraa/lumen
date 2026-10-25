from math import ceil

from app.core.config import load_config


def _tokens(text: str, chars_per_token: int) -> int:
    """Rough token count (no tokenizer): the larger of the word count and characters / chars_per_token."""
    return max(len(text.split()), ceil(len(text) / chars_per_token))


def _split_long(text: str, max_tokens: int, chars_per_token: int) -> list[str]:
    """Split an over-long chunk on word boundaries; a single huge word is cut by characters."""
    max_chars = max_tokens * chars_per_token
    pieces, current = [], []
    for word in text.split():
        words = [word[i : i + max_chars] for i in range(0, len(word), max_chars)]
        for w in words:
            if current and _tokens(" ".join(current + [w]), chars_per_token) > max_tokens:
                pieces.append(" ".join(current))
                current = []
            current.append(w)
    if current:
        pieces.append(" ".join(current))
    return pieces


def chunk(text: str, size_words: int = 120, overlap_words: int = 30) -> list[str]:
    """Split text into word-based chunks; each chunk starts with the last overlap_words of the previous one.
    A chunk over ingest.max_chunk_tokens (estimated, see config.yaml) is split further."""
    if overlap_words >= size_words:
        raise ValueError("overlap_words must be smaller than size_words")
    cfg = load_config()["ingest"]
    words = text.split()
    step = size_words - overlap_words
    chunks = []
    for start in range(0, len(words), step):
        chunks.append(" ".join(words[start : start + size_words]))
        if start + size_words >= len(
            words
        ):  # this chunk reached the end; no tiny repeat chunk after it
            break
    out = []
    for c in chunks:
        if _tokens(c, cfg["chars_per_token"]) > cfg["max_chunk_tokens"]:
            out.extend(_split_long(c, cfg["max_chunk_tokens"], cfg["chars_per_token"]))
        else:
            out.append(c)
    return out
