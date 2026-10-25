"""Entry point: python tools/eval/run_eval.py [--dry-run] [--resume] [--limit N]. See README.md."""

import sys

from evalkit.cli import main

if __name__ == "__main__":
    sys.exit(main())
