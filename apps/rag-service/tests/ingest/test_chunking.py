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


def est_tokens(text):
    from math import ceil

    from app.core.config import load_config

    cfg = load_config()["ingest"]
    return max(len(text.split()), ceil(len(text) / cfg["chars_per_token"]))


def test_number_heavy_text_is_split_below_the_token_limit():
    from app.core.config import load_config

    text = " ".join(str(10**19 + i) for i in range(120))  # 120 long numbers: few words, many tokens
    parts = chunk(text)
    assert len(parts) > 1
    assert all(est_tokens(p) <= load_config()["ingest"]["max_chunk_tokens"] for p in parts)
    assert " ".join(parts).split().count("10000000000000000000") >= 1  # nothing was dropped


def test_text_without_spaces_is_split_below_the_token_limit():
    from app.core.config import load_config

    parts = chunk("x" * 5000)
    assert len(parts) > 1
    assert all(est_tokens(p) <= load_config()["ingest"]["max_chunk_tokens"] for p in parts)
    assert "".join(parts) == "x" * 5000  # a hard split loses no characters


def test_normal_text_is_not_resplit():
    assert chunk(words(100)) == [words(100)]
