from isolation.report import Outcome, exit_code, summary_lines


def outcome(**kw):
    base = dict(real_leaks=0, real_problems=0, real_checks=70, control_ran=True,
                control_leaks={"A": 12, "B": 9}, stub_answers=100)  # fmt: skip
    return Outcome(**{**base, **kw})


def test_zero_leaks_and_a_control_that_detects_leaks_is_success():
    assert exit_code(outcome()) == 0


def test_any_real_leak_fails():
    assert exit_code(outcome(real_leaks=1)) != 0


def test_unverifiable_checks_fail_even_without_leaks():
    assert exit_code(outcome(real_problems=1)) != 0


def test_a_control_that_finds_nothing_fails_the_suite():
    assert exit_code(outcome(control_leaks={"A": 0, "B": 0})) != 0
    assert (
        exit_code(outcome(control_leaks={"A": 5, "B": 0})) != 0
    )  # both tenants must be seen leaking


def test_a_control_that_did_not_run_fails_the_suite():
    assert exit_code(outcome(control_ran=False, control_leaks={})) != 0


def test_a_stub_that_was_never_called_means_nothing_was_tested():
    assert exit_code(outcome(stub_answers=0)) != 0


def test_summary_states_both_results_plainly():
    text = "\n".join(summary_lines(outcome()))
    assert "zero leaks" in text.lower() and "control" in text.lower() and "detected" in text.lower()
    bad = "\n".join(summary_lines(outcome(real_leaks=3, control_leaks={"A": 0, "B": 0})))
    assert "3 leak" in bad and "did not detect" in bad
