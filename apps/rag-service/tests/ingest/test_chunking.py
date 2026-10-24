from app.ingest.chunking import chunk


def words(n, start=0):
    return " ".join(f"w{i}" for i in range(start, start + n))


def test_short_text_is_one_chunk():
    assert chunk(words(50), size_words=120, overlap_words=30) == [words(50)]


def test_empty_text_gives_no_chunks():
    assert chunk("   \n ") == []


def test_chunks_overlap_by_the_requested_words():
    parts = chunk(words(300), size_words=120, overlap_words=30)
    assert all(len(p.split()) <= 120 for p in parts)
    for a, b in zip(parts, parts[1:]):
        assert a.split()[-30:] == b.split()[:30]  # tail of one chunk opens the next


def test_every_word_is_covered_and_last_chunk_is_not_tiny_repeat():
    parts = chunk(words(300), size_words=120, overlap_words=30)
    assert parts[-1].split()[-1] == "w299"
    assert parts[0].split()[0] == "w0"
    assert len(parts) == 3  # starts 0, 90, 180; the chunk at 180 reaches the end


def test_overlap_must_be_smaller_than_size():
    import pytest
    with pytest.raises(ValueError):
        chunk("a b c", size_words=10, overlap_words=10)
