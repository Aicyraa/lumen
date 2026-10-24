"""Outcome of a run: the exit code rule and the plain summary."""

from dataclasses import dataclass, field

MIN_CROSS = 50  # the brief: at least 50 cross-tenant questions
MIN_POSITIVE = 10  # own-data questions that must have found their data


@dataclass
class Outcome:
    real_leaks: int = 0
    real_problems: int = 0  # checks that could not be verified (bad status, missing positive data)
    real_checks: int = 0
    control_ran: bool = False
    control_leaks: dict = field(
        default_factory=dict
    )  # tenant label -> leaks found in the leaky stack
    control_problems: int = 0  # questions in the combined control that crashed or got no answer
    cross_asked: int = 0
    positives_passed: int = 0
    single_controls: dict = field(default_factory=dict)  # name -> {tenant: leaks}; informational
    stub_answers: int = (
        0  # chat calls that reached the stub model (proves the stack answered for real)
    )


def control_detected(o: Outcome) -> bool:
    return (
        o.control_ran
        and o.control_problems == 0
        and bool(o.control_leaks)
        and all(n > 0 for n in o.control_leaks.values())
    )


def enough(o: Outcome) -> bool:
    return o.cross_asked >= MIN_CROSS and o.positives_passed >= MIN_POSITIVE


def exit_code(o: Outcome) -> int:
    """0 only for zero leaks in the real run AND a control that detected leaks for every tenant."""
    ok = (
        o.real_leaks == 0
        and o.real_problems == 0
        and o.stub_answers > 0
        and enough(o)
        and control_detected(o)
    )
    return 0 if ok else 1


def summary_lines(o: Outcome) -> list[str]:
    real = (
        f"REAL STACK: zero leaks in {o.real_checks} checks"
        if o.real_leaks == 0 and o.real_problems == 0
        else f"REAL STACK: {o.real_leaks} leak(s), {o.real_problems} unverifiable check(s) in {o.real_checks} checks"
    )
    if control_detected(o):
        per = ", ".join(f"tenant {k}: {v}" for k, v in sorted(o.control_leaks.items()))
        ctrl = f"NEGATIVE CONTROL: detected leaks with the tenant filter removed ({per})"
    elif o.control_ran and o.control_problems:
        ctrl = f"NEGATIVE CONTROL: {o.control_problems} problem(s) (crashes or unanswered questions), so its leak count cannot be trusted"
    elif not o.control_ran:
        ctrl = "NEGATIVE CONTROL: did not run"
    else:
        ctrl = (
            "NEGATIVE CONTROL: did not detect leaks for every tenant, so the suite proves nothing"
        )
    lines = [real]
    if o.cross_asked < MIN_CROSS:
        lines.append(
            f"TOO FEW QUESTIONS: {o.cross_asked} cross-tenant questions asked, at least {MIN_CROSS} required"
        )
    if o.positives_passed < MIN_POSITIVE:
        lines.append(
            f"TOO FEW POSITIVE CHECKS: {o.positives_passed} passed, at least {MIN_POSITIVE} required"
        )
    stub = f"stub model answered {o.stub_answers} chat calls"
    verdict = "PASS" if exit_code(o) == 0 else "FAIL"
    lines.append(ctrl)
    for name, per in sorted(o.single_controls.items()):
        found = ", ".join(f"tenant {k}: {v}" for k, v in sorted(per.items()))
        if all(v > 0 for v in per.values()) and per:
            lines.append(f"  control, only {name} predicate removed: detected leaks ({found})")
        else:
            lines.append(
                f"  control, only {name} predicate removed: no leak for every tenant ({found}); informational, see README"
            )
    return [*lines, stub, f"RESULT: {verdict}"]
