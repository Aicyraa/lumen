from types import SimpleNamespace

import httpx2
import openai
import pytest

from app.llm import LLM, LLMResult, ProviderError, build_prompt

CFG = {"timeout_seconds": 5, "max_output_tokens": 50, "temperature": 0, "rate_limit_retry_seconds": 0}
MODELS = {"cheap": "model-small", "expensive": "model-big"}


def reply(text="Hello [1]", tokens_in=12, tokens_out=3):
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=text))],
        usage=SimpleNamespace(prompt_tokens=tokens_in, completion_tokens=tokens_out),
    )


def rate_limit_error():
    response = httpx2.Response(429, request=httpx2.Request("POST", "http://provider.test"))
    return openai.RateLimitError("slow down", response=response, body=None)


class FakeClient:
    """Stands in for openai.OpenAI: each create() call pops the next outcome (a reply or an exception)."""

    def __init__(self, outcomes):
        self.outcomes, self.calls = list(outcomes), []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def test_complete_returns_text_and_the_providers_token_counts():
    client = FakeClient([reply("Open at 8 [1]", tokens_in=812, tokens_out=96)])
    result = LLM(client, MODELS, CFG).complete("cheap", "sys", "usr")
    assert result == LLMResult("Open at 8 [1]", 812, 96)


def test_complete_uses_the_model_for_the_tier_and_config_limits():
    client = FakeClient([reply(), reply()])
    llm = LLM(client, MODELS, CFG)
    llm.complete("cheap", "sys", "usr")
    llm.complete("expensive", "sys", "usr")
    assert [c["model"] for c in client.calls] == ["model-small", "model-big"]
    assert client.calls[0]["messages"] == [{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}]
    assert client.calls[0]["max_tokens"] == 50 and client.calls[0]["temperature"] == 0


def test_one_retry_after_a_rate_limit_then_success():
    client = FakeClient([rate_limit_error(), reply("ok")])
    assert LLM(client, MODELS, CFG).complete("cheap", "s", "u").text == "ok"
    assert len(client.calls) == 2


def test_second_rate_limit_becomes_provider_error():
    client = FakeClient([rate_limit_error(), rate_limit_error(), reply()])
    with pytest.raises(ProviderError):
        LLM(client, MODELS, CFG).complete("cheap", "s", "u")
    assert len(client.calls) == 2  # exactly one retry


def test_other_provider_failure_is_not_retried_and_hides_details():
    request = httpx2.Request("POST", "http://provider.test")
    client = FakeClient([openai.APIConnectionError(request=request), reply()])
    with pytest.raises(ProviderError) as exc:
        LLM(client, MODELS, CFG).complete("cheap", "s", "u")
    assert len(client.calls) == 1
    assert "provider.test" not in str(exc.value)


def test_prompt_numbers_the_passages_and_marks_them_untrusted():
    system, user = build_prompt("When do you open?", ["first passage", "second passage"])
    assert "untrusted" in system and "I could not find that in the documents." in system
    assert user == "Passages:\n[1] first passage\n[2] second passage\n\nQuestion: When do you open?"
