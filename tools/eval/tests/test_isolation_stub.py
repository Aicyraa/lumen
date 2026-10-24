import json
import sys
from pathlib import Path

from isolation.stub_model import StubModel, answer_for, first_passage, quote_span

from evalkit.http import request

RAG_DIR = Path(__file__).resolve().parents[3] / "apps" / "rag-service"
sys.path.insert(0, str(RAG_DIR))
from app.llm.prompt import build_prompt, render_answer  # noqa: E402  (the real validator)

P1 = "Code word: AMBERFOX-4417. Northwind Bakery uses it to confirm wholesale orders by phone. More words follow here."
P2 = "Second passage about sourdough."


def messages(passages, q="What?"):
    system, user = build_prompt(q, passages)
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def test_first_passage_is_parsed_from_the_user_message():
    assert first_passage(messages([P1, P2])[1]["content"]) == P1
    assert first_passage("Reply with OK.") is None


def test_quote_span_is_an_exact_short_word_aligned_slice():
    span = quote_span(P1, 60)
    assert span in P1 and P1.startswith(span) and len(span) <= 60 and span.endswith("4417.")
    assert quote_span("short", 60) == "short"


def test_answer_passes_the_real_quote_validator():
    raw = answer_for(messages([P1, P2]))
    rendered = render_answer(raw, [P1, P2], "I could not find that in the documents.")
    assert "AMBERFOX-4417" in rendered and "[1]" in rendered
    assert json.loads(raw)["claims"][0]["evidence"][0]["passage"] == 1


def test_connection_test_message_gets_a_plain_ok():
    assert answer_for([{"role": "user", "content": "Reply with OK."}]) == "OK"


def test_server_answers_on_localhost_both_ways_and_counts_calls():
    with StubModel() as stub:
        assert stub.url.startswith("http://localhost:")
        body = {"model": "m", "messages": messages([P1])}
        for host in ("localhost", "127.0.0.1", "[::1]"):
            r = request(
                "POST", stub.url.replace("localhost", host) + "/chat/completions", json_body=body
            )
            assert r.status == 200
            assert "AMBERFOX-4417" in r.body["choices"][0]["message"]["content"]
            assert r.body["usage"]["prompt_tokens"] > 0
        request("POST", stub.url + "/chat/completions", json_body={"model": "m", "messages": [
            {"role": "user", "content": "Reply with OK."}]})  # fmt: skip
        assert stub.answer_calls == 3 and stub.calls == 4
