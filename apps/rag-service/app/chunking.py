def chunk(text: str, size_words: int = 120, overlap_words: int = 30) -> list[str]:
    """Split text into word-based chunks; each chunk starts with the last overlap_words of the previous one."""
    if overlap_words >= size_words:
        raise ValueError("overlap_words must be smaller than size_words")
    words = text.split()
    step = size_words - overlap_words
    chunks = []
    for start in range(0, len(words), step):
        chunks.append(" ".join(words[start:start + size_words]))
        if start + size_words >= len(words):  # this chunk reached the end; no tiny repeat chunk after it
            break
    return chunks
