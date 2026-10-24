"""pnpm eval:isolation: scratch database, own API + rag-service + stub model, leak checks, negative control."""

import atexit
import signal
import sys
from pathlib import Path

from evalkit.config import parse_env_file
from isolation import suite
from isolation.flow import run_flow
from isolation.realenv import ROOT, RealEnv
from isolation.report import Outcome, exit_code, summary_lines
from isolation.stack import StackError


def say(msg=""):
    print(msg, flush=True)


def real_env(say_):
    dev_url = parse_env_file(Path(ROOT) / "apps/api/.env").get("DATABASE_URL", "")
    if not dev_url:
        raise StackError("apps/api/.env has no DATABASE_URL")
    return RealEnv(dev_url, say_)


def main(make_env=real_env, suite_mod=suite, say=say) -> int:
    out = Outcome()
    env = None
    try:
        env = make_env(say)
        atexit.register(env.cleanup)  # also on sys.exit from a signal; cleanup is safe to repeat
        for sig in (signal.SIGINT, signal.SIGTERM):
            signal.signal(sig, lambda *_: sys.exit(130))
        out = run_flow(env, suite_mod, say)
    except StackError as e:
        say(f"\nSTACK ERROR: {e}")
        out.real_problems += 1
    except Exception as e:
        say(f"\nERROR: {type(e).__name__}: {e}")
        out.real_problems += 1
    finally:
        if env is not None:
            env.cleanup()
    say()
    for line in summary_lines(out):
        say(line)
    return exit_code(out)


if __name__ == "__main__":
    sys.exit(main())
