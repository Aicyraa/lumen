import pytest

from app.extract import extract_text

# smallest valid one-page PDF with the text "Hello PDF world"
PDF = (
    b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R"
    b"/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
    b"4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 100 Td (Hello PDF world) Tj ET\nendstream endobj\n"
    b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
    b"trailer<</Root 1 0 R/Size 6>>\n%%EOF\n"
)


@pytest.mark.parametrize("name", ["a.txt", "b.md"])
def test_plain_text_and_markdown(tmp_path, name):
    f = tmp_path / name
    f.write_text("# Title\nsome text", encoding="utf-8")
    assert extract_text(f) == "# Title\nsome text"


def test_pdf(tmp_path):
    f = tmp_path / "c.pdf"
    f.write_bytes(PDF)
    assert "Hello PDF world" in extract_text(f)


def test_unsupported_type_is_rejected(tmp_path):
    f = tmp_path / "d.docx"
    f.write_bytes(b"x")
    with pytest.raises(ValueError):
        extract_text(f)
