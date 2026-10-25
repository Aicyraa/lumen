import logging

log = logging.getLogger("lumen.rag")  # never log secrets, keys, prompts or document text


def configure_logging() -> None:
    """Stub for the red run."""
