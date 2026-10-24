from isolation.data import TENANT_A, TENANT_B
from isolation.questions import cross_tenant_questions, positive_questions


def test_each_tenant_has_one_unique_code_word_planted_only_in_its_own_documents():
    for mine, other in ((TENANT_A, TENANT_B), (TENANT_B, TENANT_A)):
        assert mine.code not in other.code
        alltext = " ".join(other.docs.values()).lower()
        assert mine.code.lower() not in alltext and mine.brand.lower() not in alltext
        assert sum(mine.code in t for t in mine.docs.values()) >= 1
    assert (TENANT_A.code, TENANT_B.code) == ("AMBERFOX-4417", "COBALTOWL-9082")


def test_documents_are_small_enough_to_stay_one_chunk():
    for t in (TENANT_A, TENANT_B):
        for name, text in t.docs.items():
            assert len(text.split()) <= 100, name  # chunker size is 120 words


def test_at_least_fifty_distinct_cross_tenant_questions_both_ways():
    a = cross_tenant_questions(TENANT_A, TENANT_B, other_tenant_id="tid-b")
    b = cross_tenant_questions(TENANT_B, TENANT_A, other_tenant_id="tid-a")
    texts = [q.text for q in a + b]
    assert len(a) >= 25 and len(b) >= 25 and len(a) + len(b) >= 50
    assert len(set(texts)) == len(texts)
    assert {q.kind for q in a} >= {
        "foreign_code",
        "foreign_doc",
        "foreign_topic",
        "injection",
        "generic",
    }
    assert any("COBALTOWL-9082" in q.text for q in a) and any("AMBERFOX-4417" in q.text for q in b)
    assert any("tid-b" in q.text for q in a)
    assert any("ignore previous instructions" in q.text.lower() for q in a)


def test_positive_questions_target_own_documents():
    pos = positive_questions(TENANT_A)
    assert len(pos) >= 4
    assert any(p.expects_code for p in pos) and any(not p.expects_code for p in pos)
    assert all(p.expected_doc in TENANT_A.docs for p in pos)
