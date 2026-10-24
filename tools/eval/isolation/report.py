"""Outcome of a run: the exit code rule and the plain summary."""

from dataclasses import dataclass, field


@dataclass
class Outcome:
    real_leaks: int = 0
    real_problems: int = 0  # checks that could not be verified (bad status, missing positive data)
    real_checks: int = 0
    control_ran: bool = False
    control_leaks: dict = field(
        default_factory=dict
    )  # tenant label -> leaks found in the leaky stack
    stub_answers: int = (
        0  # chat calls that reached the stub model (proves the stack answered for real)
    )


def control_detected(o: Outcome) -> bool:
    return o.control_ran and bool(o.control_leaks) and all(n > 0 for n in o.control_leaks.values())


def exit_code(o: Outcome) -> int:
    """0 only for zero leaks in the real run AND a control that detected leaks for every tenant."""
    ok = o.real_leaks == 0 and o.real_problems == 0 and o.stub_answers > 0 and control_detected(o)
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
    elif not o.control_ran:
        ctrl = "NEGATIVE CONTROL: did not run"
    else:
        ctrl = (
            "NEGATIVE CONTROL: did not detect leaks for every tenant, so the suite proves nothing"
        )
    stub = f"stub model answered {o.stub_answers} chat calls"
    verdict = "PASS" if exit_code(o) == 0 else "FAIL"
    return [real, ctrl, stub, f"RESULT: {verdict}"]
