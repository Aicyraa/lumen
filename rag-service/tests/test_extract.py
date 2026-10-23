import pytest

from app.extract import extract_text

def make_pdf(text: str) -> bytes:
    """Smallest valid one-page PDF, with a real xref table so pypdf accepts it."""
    stream = f"BT /F1 12 Tf 20 100 Td ({text}) Tj ET".encode()
    objs = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length %d>>stream\n" % len(stream) + stream + b"\nendstream",
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 6\n0000000000 65535 f \n" + b"".join(b"%010d 00000 n \n" % o for o in offsets)
    return out + b"trailer<</Root 1 0 R/Size 6>>\nstartxref\n%d\n%%%%EOF\n" % xref


@pytest.mark.parametrize("name", ["a.txt", "b.md"])
def test_plain_text_and_markdown(tmp_path, name):
    f = tmp_path / name
    f.write_text("# Title\nsome text", encoding="utf-8")
    assert extract_text(f) == "# Title\nsome text"


def test_pdf(tmp_path):
    f = tmp_path / "c.pdf"
    f.write_bytes(make_pdf("Hello PDF world"))
    assert "Hello PDF world" in extract_text(f)


def test_unsupported_type_is_rejected(tmp_path):
    f = tmp_path / "d.docx"
    f.write_bytes(b"x")
    with pytest.raises(ValueError):
        extract_text(f)
