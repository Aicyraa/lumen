"""The isolation flow: real stack checks, then the negative controls. Pure orchestration over an env."""

from isolation.data import TENANT_A, TENANT_B
from isolation.report import Outcome

# (name, functions whose tenant_id predicate is removed); None = both. The combined control is mandatory.
VARIANTS = [
    ("combined", None),
    ("vector", ("dense_search",)),  # the dense query; the probe is the same SQL
    ("keyword", ("keyword_search",)),
]


def print_run(say, title, run, verbose=False):
    say(
        f"\n== {title}: {run.checks} checks, {len(run.leaks)} leak(s), {len(run.problems)} problem(s)"
    )
    for label, name, ok in run.results:
        if verbose and not name.startswith("chat["):
            say(f"  {'PASS' if ok else 'FAIL'} tenant {label} · {name}")
    for label, name, f in run.findings:
        say(f"  [{f.kind}] tenant {label} · {name} · {f.detail}")


def run_flow(env, suite, say) -> Outcome:
    out = Outcome()
    api = env.start_real()
    tenants = suite.provision(api, [TENANT_A, TENANT_B], env.stub_url)
    say(f"provisioned tenants A and B with {sum(len(t.doc_ids) for t in tenants)} documents")
    run = suite.Run()
    suite.run_questions(api, tenants, run, positives=True)
    suite.run_object_checks(api, tenants, run)
    out.real_leaks, out.real_problems, out.real_checks = (
        len(run.leaks),
        len(run.problems),
        run.checks,
    )
    out.stub_answers = env.stub_answers()
    out.cross_asked, out.positives_passed = run.cross, run.positives_passed
    print_run(say, "REAL STACK", run, verbose=True)
    say(
        f"cross-tenant questions: {run.cross}; positive checks: {run.positives}; "
        f"object-level and dashboard checks: {run.checks - run.cross - run.positives}; "
        f"chat calls in total: {sum(t.chat_calls for t in tenants)}"
    )
    for variant, which in VARIANTS:
        api2 = env.start_control(variant, which)
        for t in tenants:
            t.request_ids, t.chat_calls = [], 0
        control = suite.Run()
        suite.run_questions(api2, tenants, control, positives=False)
        per = {
            t.spec.label: sum(1 for lb, _, _ in control.leaks if lb == t.spec.label)
            for t in tenants
        }
        say(
            f"  {control.cross} cross-tenant questions, {len(control.leaks)} leak(s) detected {per}, "
            f"{len(control.problems)} problem(s)"
        )
        for lb, nm, f in (control.leaks + control.problems)[:3]:
            say(f"  [{f.kind}] tenant {lb} · {nm[:50]} · {f.detail[:90]}")
        if which is None:
            out.control_ran, out.control_leaks = True, per
            out.control_problems = len(control.problems)
        else:
            out.single_controls[variant] = per
        env.stop_services()
    return out
