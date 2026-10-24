"""Scratch database and own processes for the isolation suite. Never touches the dev database."""

import os
import signal
import socket
import subprocess
import time
from pathlib import Path
from urllib.parse import urlparse, urlunparse

PREFIX = "lumen_isolation_"
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


class StackError(Exception):
    pass


def scratch_name(now: float | None = None) -> str:
    return f"{PREFIX}{int(now if now is not None else time.time())}"


def derive_urls(dev_url: str, name: str) -> tuple[str, str]:
    """(admin url for CREATE/DROP DATABASE, scratch url) from the dev URL; credentials stay in memory."""
    if not name.startswith(PREFIX):
        raise StackError(f"scratch database names must start with {PREFIX}")
    p = urlparse(dev_url)
    if (p.hostname or "") not in LOCAL_HOSTS:
        raise StackError(
            "refusing to create a scratch database: DATABASE_URL is not a local server"
        )
    return urlunparse(p._replace(path="/postgres")), urlunparse(p._replace(path=f"/{name}"))


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def wait_http(
    url: str, ok=(200,), timeout=120.0, proc: subprocess.Popen | None = None, what="service"
):
    from evalkit.http import HttpError, request

    end = time.time() + timeout
    while time.time() < end:
        if proc is not None and proc.poll() is not None:
            raise StackError(f"{what} exited early with code {proc.returncode}")
        try:
            if request("GET", url, timeout=3).status in ok:
                return
        except HttpError:
            pass
        time.sleep(0.4)
    raise StackError(f"{what} did not become ready within {timeout:.0f}s")


class Procs:
    """Child processes in their own sessions, stopped by PID group (never by name)."""

    def __init__(self, logdir: Path):
        self.logdir, self.procs = logdir, []

    def start(self, name, argv, *, cwd, env) -> subprocess.Popen:
        log = open(self.logdir / f"{name}.log", "wb")
        p = subprocess.Popen(
            argv, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True
        )
        self.procs.append((name, p))
        return p

    def tail(self, name, lines=25) -> str:
        path = self.logdir / f"{name}.log"
        return (
            "\n".join(path.read_text(errors="replace").splitlines()[-lines:])
            if path.exists()
            else ""
        )

    def stop_all(self):
        for _, p in reversed(self.procs):
            if p.poll() is None:
                try:
                    os.killpg(p.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
        deadline = time.time() + 8
        for _, p in self.procs:
            try:
                p.wait(max(0.1, deadline - time.time()))
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(p.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                p.wait()
        self.procs = []
