from evalkit.http import HttpResult
from isolation.data import TENANT_A, TENANT_B
from isolation.report import MIN_CROSS, MIN_POSITIVE, Outcome, exit_code, summary_lines
from isolation.suite import Run, Tenant, run_questions


class FakeApi:
    """Answers every chat with a clean 200 that cites nothing."""

    def __init__(self):
        self.n = 0

    def call(self, method, path, **kw):
        self.n += 1
        body = {"request_id": f"r{self.n}", "answer": "I could not find that in the documents.", "sources": []}
        return HttpResult(200, {}, body, "{}")


def tenants():
    a, b = Tenant(TENANT_A, tenant_id="ta"), Tenant(TENANT_B, tenant_id="tb")
    for t in (a, b):
        t.doc_ids = {n: f"{t.spec.label}-{n}" for n in t.spec.docs}
    return [a, b]


def test_run_questions_counts_what_it_asked():
    run = Run()
    api = FakeApi()
    run_questions(api, tenants(), run, positives=True)
    assert run.cross >= 50 and run.positives >= 10
    assert run.cross + run.positives == api.n == run.checks
    assert run.positives_passed == 0  # the fake finds nothing, so no positive passed


def test_control_mode_asks_no_positives():
    run = Run()
    run_questions(FakeApi(), tenants(), run, positives=False)
    assert run.positives == 0 and run.cross >= 50


def good(**kw):
    base = dict(real_checks=100, control_ran=True, control_leaks={"A": 3, "B": 3}, stub_answers=9,
                cross_asked=64, positives_passed=14)  # fmt: skip
    return Outcome(**{**base, **kw})


def test_too_few_cross_tenant_questions_fail_the_suite():
    assert exit_code(good()) == 0
    o = good(cross_asked=MIN_CROSS - 1)
    assert exit_code(o) != 0 and "at least" in "\n".join(summary_lines(o))


def test_too_few_passed_positives_fail_the_suite():
    o = good(positives_passed=MIN_POSITIVE - 1)
    assert exit_code(o) != 0 and "positive" in "\n".join(summary_lines(o)).lower()


def test_single_predicate_controls_are_reported_but_not_required():
    o = good(single_controls={"vector": {"A": 4, "B": 5}, "keyword": {"A": 0, "B": 0}})
    assert exit_code(o) == 0  # the combined control stays the mandatory one
    text = "\n".join(summary_lines(o))
    assert "vector" in text and "keyword" in text and "no leak" in text.lower()
