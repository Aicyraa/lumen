from pathlib import Path

from pypdf import PdfReader

from app.core.config import load_config


class UnreadableDocument(ValueError):
    """A PDF that cannot be read (corrupt or encrypted)."""


class DocumentTooLarge(ValueError):
    """More pages than ingest.max_pages."""


def extract_text(path) -> str:
    """Read .txt/.md as UTF-8 or a PDF with pypdf. A scanned PDF gives an empty string (no OCR)."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix in (".txt", ".md"):
        return path.read_text(encoding="utf-8")
    if suffix != ".pdf":  # checked before the file is opened
        raise ValueError(f"unsupported file type: {suffix}")
    try:  # pypdf raises many types for corrupt or encrypted files; only the PDF read is caught broadly
        pages = PdfReader(path).pages
        if len(pages) > load_config()["ingest"]["max_pages"]:
            raise DocumentTooLarge(f"more than {load_config()['ingest']['max_pages']} pages")
        return "\n".join(page.extract_text() or "" for page in pages)
    except DocumentTooLarge:
        raise
    except Exception as e:
        raise UnreadableDocument("the PDF could not be read") from e
