import logging
import os
import re

log = logging.getLogger("lumen.rag")  # never log secrets, keys, prompts, passages or snippets


class OneLineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return re.sub(
            r"[\r\n]+", " ", super().format(record)
        )  # a value with a newline cannot forge a line


def formatter() -> logging.Formatter:
    return OneLineFormatter("%(asctime)s level=%(levelname)s logger=%(name)s msg=%(message)s")


def configure_logging() -> None:
    """Send lumen.rag lines to stderr at LOG_LEVEL (default INFO). Third-party loggers keep their own level."""
    level = logging.getLevelNamesMapping().get(
        os.environ.get("LOG_LEVEL", "").upper(), logging.INFO
    )
    handler = logging.StreamHandler()
    handler.setFormatter(formatter())
    logging.basicConfig(handlers=[handler])  # no-op when the host already set up logging
    log.setLevel(level)
