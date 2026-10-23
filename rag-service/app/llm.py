from dataclasses import dataclass


class ProviderError(Exception):
    """The language model provider failed (after one retry on a 429)."""


@dataclass
class LLMResult:
    text: str
    tokens_in: int
    tokens_out: int


def build_prompt(query: str, passages: list[str]) -> tuple[str, str]:
    # STUB
    return "", ""


class LLM:
    def __init__(self, client, models: dict, cfg: dict):
        self.client, self.models, self.cfg = client, models, cfg

    def complete(self, tier: str, system: str, user: str) -> LLMResult:
        # STUB
        return LLMResult("", 0, 0)
