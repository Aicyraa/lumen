"""The orchestration against fakes: no process, database or network."""

from isolation import suite as real_suite
from isolation.__main__ import main
from isolation.checks import Finding
from isolation.flow import VARIANTS, run_flow
from isolation.realenv import RealEnv
from isolation.stack import drop_statement


class FakeApi:
    def __init__(self, leaky=False):
        self.leaky = leaky


class FakeSuite:
    Tenant, Run = real_suite.Tenant, real_suite.Run

    def __init__(self, control_problems=0):
        self.control_problems = control_problems

    def provision(self, api, specs, stub_url):
        return [self.Tenant(s, tenant_id=f"id-{s.label}") for s in specs]

    def run_questions(self, api, tenants, run, *, positives):
        for t in tenants:
            for i in range(32):
                run.cross += 1
                leak = [Finding("foreign_source", "x")] if api.leaky else []
                run.add(t.spec.label, f"chat[k] {i}", leak)
            if positives:
                for i in range(7):
                    run.positives += 1
                    run.positives_passed += 1
                    run.add(t.spec.label, f"positive {i}", [])
            elif self.control_problems:
                run.add(
                    t.spec.label,
                    "chat[k] broken",
                    [Finding("bad_status", "HTTP 500")] * self.control_problems,
                )

    def run_object_checks(self, api, tenants, run):
        for _ in range(30):
            run.add("A", "object", [])


class FakeEnv:
    db_name = "lumen_isolation_42"
    stub_url = "http://localhost:1/v1"

    def __init__(self, fail_at=None):
        self.events, self.fail_at = [], fail_at

    def start_real(self):
        self.events.append("real")
        return FakeApi()

    def start_control(self, variant, which):
        self.events.append(f"control:{variant}")
        if variant == self.fail_at:
            raise RuntimeError("boom")
        return FakeApi(leaky=True)

    def stop_services(self):
        self.events.append("stop")

    def stub_answers(self):
        return 58

    def cleanup(self):
        self.events.append("cleanup")


def test_flow_runs_the_real_stack_then_every_control_variant():
    env = FakeEnv()
    out = run_flow(env, FakeSuite(), lambda *_: None)
    assert [v for v, _ in VARIANTS] == ["combined", "vector", "keyword"]
    assert env.events == [
        "real",
        "control:combined",
        "stop",
        "control:vector",
        "stop",
        "control:keyword",
        "stop",
    ]
    assert (out.cross_asked, out.positives_passed, out.real_leaks) == (64, 14, 0)
    assert out.control_leaks == {"A": 32, "B": 32} and set(out.single_controls) == {
        "vector",
        "keyword",
    }
    assert out.control_problems == 0 and out.stub_answers == 58


def test_flow_records_problems_in_the_control():
    out = run_flow(FakeEnv(), FakeSuite(control_problems=2), lambda *_: None)
    assert out.control_problems > 0


def test_main_cleans_up_and_fails_when_a_step_raises():
    env = FakeEnv(fail_at="vector")
    assert main(make_env=lambda say: env, suite_mod=FakeSuite(), say=lambda *_: None) != 0
    assert env.events.count("cleanup") == 1 and env.events[-1] == "cleanup"


def test_main_returns_zero_for_a_clean_run():
    env = FakeEnv()
    assert main(make_env=lambda say: env, suite_mod=FakeSuite(), say=lambda *_: None) == 0
    assert env.events[-1] == "cleanup"


class FakeConn:
    def __init__(self, log):
        self.log = log

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql):
        self.log.append(sql)


class FakeProcs:
    def __init__(self, *a):
        self.stopped = 0

    def stop_all(self):
        self.stopped += 1


class FakeStub:
    answer_calls = 0

    def stop(self):
        pass


def test_cleanup_drops_the_scratch_database_even_after_the_control_loop_ran(tmp_path):
    log = []
    env = RealEnv(
        dev_url="postgresql://u:p@localhost:5433/lumen",
        say=lambda *_: None,
        connect=lambda url, **kw: FakeConn(log),
        procs_factory=FakeProcs,
        stub=FakeStub(),
        tmp=tmp_path / "t",
    )
    env.create_db()
    for variant, _ in VARIANTS:  # the loop that once shadowed the database name
        env.stop_services()
        assert variant
    env.cleanup()
    assert log == [f'CREATE DATABASE "{env.db_name}"', drop_statement(env.db_name)]
    assert env.db_name.startswith("lumen_isolation_") and not (tmp_path / "t").exists()


def test_cleanup_does_not_drop_what_was_never_created(tmp_path):
    log = []
    env = RealEnv(
        "postgresql://u:p@localhost:5433/lumen",
        lambda *_: None,
        lambda u, **k: FakeConn(log),
        FakeProcs,
        FakeStub(),
        tmp_path / "t",
    )
    env.cleanup()
    assert log == []


def test_control_variants_are_the_documented_three():
    assert (
        VARIANTS[0] == ("combined", None)
        and VARIANTS[1][1] == ("search",)
        and VARIANTS[2][1] == ("keyword_search",)
    )
