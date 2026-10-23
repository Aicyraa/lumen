from app.llm import build_prompt


def test_prompt_numbers_the_passages_and_marks_them_untrusted():
    system, user = build_prompt("When do you open?", ["first passage", "second passage"])
    assert "untrusted" in system and "I could not find that in the documents." in system
    assert user == "Passages:\n[1] first passage\n[2] second passage\n\nQuestion: When do you open?"
