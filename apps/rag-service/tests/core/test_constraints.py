import re
import tomllib
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[2]
UNPINNED_ON_PURPOSE = {"torch"}  # CI installs the CPU build first; other machines pick their own


def pins():
    lines = (SERVICE_DIR / "constraints.txt").read_text().splitlines()
    return dict(line.split("==") for line in lines if line.strip() and not line.startswith("#"))


def name(requirement: str) -> str:
    return re.split(r"[\[<>=!~ ]", requirement, maxsplit=1)[0].lower().replace("_", "-")


def test_every_direct_dependency_is_pinned_to_one_version():
    project = tomllib.loads((SERVICE_DIR / "pyproject.toml").read_text())["project"]
    direct = project["dependencies"] + project["optional-dependencies"]["dev"]
    missing = [name(r) for r in direct if name(r) not in pins()]
    assert missing == []


def test_constraints_are_exact_sorted_and_free_of_platform_builds():
    lines = [
        x for x in (SERVICE_DIR / "constraints.txt").read_text().splitlines() if x and x[0] != "#"
    ]
    assert all(re.fullmatch(r"[a-z0-9.-]+==[0-9][^=\s]*", x) for x in lines)
    assert lines == sorted(lines)
    assert not any(
        x.split("==")[0] in UNPINNED_ON_PURPOSE or x.startswith("nvidia-") for x in lines
    )
