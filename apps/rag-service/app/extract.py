from pathlib import Path

from pypdf import PdfReader


def extract_text(path) -> str:
    """Read .txt/.md as UTF-8 or a PDF with pypdf. A scanned PDF gives an empty string (no OCR)."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md"):
        return path.read_text(encoding="utf-8")
    if suffix == ".pdf":
        return "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    raise ValueError(f"unsupported file type: {suffix}")
