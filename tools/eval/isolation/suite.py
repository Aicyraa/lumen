"""Provision two tenants through the public API and run the leak checks against one API instance."""

import time
import uuid
from dataclasses import dataclass, field

from evalkit.http import request
from isolation.checks import (
    LEAK_KINDS,
    Finding,
    check_chat,
    check_no_foreign_rows,
    check_not_found,
    check_positive,
)
from isolation.data import TenantSpec
from isolation.questions import cross_tenant_questions, positive_questions

PASSWORD = "isolation-Test-pass-1"
READY_TIMEOUT = 180.0


@dataclass
class Tenant:
    spec: TenantSpec
    email: str = ""
    tenant_id: str = ""
    key: str = field(default="", repr=False)
    cookie: str = field(default="", repr=False)
    doc_ids: dict = field(default_factory=dict)  # filename -> document id
    model_ids: list = field(default_factory=list)
    request_ids: list = field(default_factory=list)
    chat_calls: int = 0

    @property
    def markers(self) -> list[str]:
        """Strings that must never appear in another tenant's responses."""
        return [self.spec.code, self.spec.brand, *self.spec.docs]


@dataclass
class Run:
    """What one pass over the checks found."""

    findings: list = field(default_factory=list)  # (tenant label, check name, Finding)
    checks: int = 0
    results: list = field(default_factory=list)  # (tenant label, check name, passed)
    cross: int = 0  # cross-tenant questions asked
    positives_passed: int = 0
    positives: int = 0  # own-data questions that must find their data

    def add(self, label, name, findings):
        self.checks += 1
        self.results.append((label, name, not findings))
        self.findings += [(label, name, f) for f in findings]

    @property
    def leaks(self):
        return [x for x in self.findings if x[2].kind in LEAK_KINDS]

    @property
    def problems(self):
        return [x for x in self.findings if x[2].kind not in LEAK_KINDS]


class Api:
    def __init__(self, base: str, origin: str, internal_secret: str):
        self.base, self.origin, self.secret = base.rstrip("/"), origin, internal_secret

    def call(self, method, path, *, key=None, cookie=None, json_body=None, data=None, headers=None):
        h = {"Origin": self.origin, **(headers or {})}
        if key:
            h["x-api-key"] = key
        if cookie:
            h["Cookie"] = cookie
        return request(
            method, self.base + path, headers=h, json_body=json_body, data=data, timeout=120
        )


def multipart(filename: str, text: str) -> tuple[bytes, str]:
    b = uuid.uuid4().hex
    body = (
        f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: text/plain\r\n\r\n{text}\r\n--{b}--\r\n"
    ).encode()
    return body, f"multipart/form-data; boundary={b}"


def must(resp, status, what):
    if resp.status != status:
        code = (
            (resp.body or {}).get("error", {}).get("code") if isinstance(resp.body, dict) else None
        )
        raise RuntimeError(f"{what}: expected HTTP {status}, got {resp.status} {code or ''}")
    return resp


def provision(api: Api, specs, stub_url: str) -> list[Tenant]:
    """Sign up, verify (dev route), sign in, mint a key, add the stub model, upload and ingest documents."""
    stamp = int(time.time())
    tenants = []
    for spec in specs:
        t = Tenant(spec, email=f"iso-{spec.label.lower()}-{stamp}@example.test")
        must(api.call("POST", "/api/auth/sign-up/email", json_body={
            "email": t.email, "password": PASSWORD, "name": f"Isolation {spec.label}"}), 200, "sign up")  # fmt: skip
        must(api.call("POST", "/dev/verify-email", json_body={"email": t.email},
                      headers={"x-internal-secret": api.secret}), 204, "verify email")  # fmt: skip
        r = must(api.call("POST", "/api/auth/sign-in/email",
                          json_body={"email": t.email, "password": PASSWORD}), 200, "sign in")  # fmt: skip
        t.cookie = "; ".join(c.split(";")[0] for c in r.set_cookies)
        r = must(api.call("POST", "/dev/api-key", json_body={"email": t.email},
                          headers={"x-internal-secret": api.secret}), 200, "api key")  # fmt: skip
        t.tenant_id, t.key = r.body["tenant_id"], r.body["api_key"]
        r = must(api.call("POST", "/api/dashboard/models", cookie=t.cookie, json_body={
            "provider": "openai_compatible", "model_id": "stub-small", "endpoint_url": stub_url,
            "api_key": f"stub-key-{spec.label}-0001", "tier": "cheap"}), 201, "add stub model")  # fmt: skip
        t.model_ids.append(r.body["model"]["id"])
        for name, text in spec.docs.items():
            body, ctype = multipart(name, text)
            r = must(api.call("POST", "/v1/documents", key=t.key, data=body,
                              headers={"content-type": ctype}), 202, f"upload {name}")  # fmt: skip
            t.doc_ids[name] = r.body["document_id"]
        tenants.append(t)
    for t in tenants:  # wait for ingestion
        for name, doc_id in t.doc_ids.items():
            end = time.time() + READY_TIMEOUT
            while True:
                r = must(
                    api.call("GET", f"/v1/documents/{doc_id}", key=t.key), 200, "document status"
                )
                if r.body["status"] == "ready":
                    break
                if r.body["status"] == "failed" or time.time() > end:
                    raise RuntimeError(f"document {name} did not become ready: {r.body['status']}")
                time.sleep(0.5)
    return tenants


def chat(api: Api, t: Tenant, query: str, extra=None, headers=None):
    r = api.call(
        "POST", "/v1/chat", key=t.key, json_body={"query": query, **(extra or {})}, headers=headers
    )
    t.chat_calls += 1
    if r.status == 200 and isinstance(r.body, dict):
        t.request_ids.append(r.body["request_id"])
    return r


def run_questions(api: Api, tenants, run: Run, *, positives: bool):
    for t in tenants:
        other = next(o for o in tenants if o is not t)
        own_ids = set(t.doc_ids.values())
        for q in cross_tenant_questions(t.spec, other.spec, other.tenant_id):
            run.cross += 1
            run.add(
                t.spec.label,
                f"chat[{q.kind}] {q.text[:60]}",
                check_chat(chat(api, t, q.text), own_ids, other.markers),
            )
        if positives:
            for p in positive_questions(t.spec):
                run.positives += 1
                r = chat(api, t, p.text)
                found = check_chat(r, own_ids, other.markers)
                found += check_positive(
                    r, own_ids, t.spec.code if p.expects_code else None, t.doc_ids[p.expected_doc]
                )
                run.positives_passed += not found
                run.add(t.spec.label, f"positive {p.text[:60]}", found)


def run_object_checks(api: Api, tenants, run: Run):
    for t in tenants:
        o = next(x for x in tenants if x is not t)
        L = t.spec.label
        foreign_doc = next(iter(o.doc_ids.values()))
        foreign_req = o.request_ids[0]
        run.add(
            L,
            "GET foreign document",
            check_not_found(
                api.call("GET", f"/v1/documents/{foreign_doc}", key=t.key), "GET foreign document"
            ),
        )
        run.add(
            L,
            "DELETE foreign document",
            check_not_found(
                api.call("DELETE", f"/v1/documents/{foreign_doc}", key=t.key),
                "DELETE foreign document",
            ),
        )
        still = api.call("GET", f"/v1/documents/{foreign_doc}", key=o.key)
        run.add(
            L,
            "foreign DELETE changed nothing",
            []
            if still.status == 200
            else [
                Finding(
                    "not_404",
                    f"foreign DELETE removed the document (owner now gets HTTP {still.status})",
                )
            ],
        )
        run.add(
            L,
            "GET foreign request (dashboard)",
            check_not_found(
                api.call("GET", f"/api/dashboard/requests/{foreign_req}", cookie=t.cookie),
                "GET foreign request",
            ),
        )
        run.add(
            L,
            "feedback on foreign request",
            check_not_found(
                api.call(
                    "POST",
                    "/v1/feedback",
                    key=t.key,
                    json_body={"request_id": foreign_req, "rating": 1},
                ),
                "feedback on foreign request",
            ),
        )
        own_fb = api.call(
            "POST",
            "/v1/feedback",
            key=t.key,
            json_body={"request_id": t.request_ids[0], "rating": 1},
        )
        run.add(
            L,
            "feedback on own request works",
            []
            if own_fb.status == 204
            else [Finding("bad_status", f"own feedback: HTTP {own_fb.status}")],
        )
        bad = api.call("GET", f"/v1/documents/{foreign_doc}", key=t.key[:-3] + "xxx")
        run.add(
            L,
            "altered key is rejected",
            [] if bad.status == 401 else [Finding("not_404", f"altered key: HTTP {bad.status}")],
        )
        r = chat(
            api,
            t,
            "What is the code word?",
            extra={"tenant_id": o.tenant_id},
            headers={"x-tenant-id": o.tenant_id},
        )
        run.add(
            L,
            "tenant_id in body/header is ignored",
            check_chat(r, set(t.doc_ids.values()), o.markers),
        )
        # dashboard: tenant A's pages show only A's rows
        foreign_ids = [*o.doc_ids.values(), *o.request_ids, o.tenant_id, *o.model_ids]
        for path, id_keys in [
            ("/api/dashboard/documents", None), ("/api/dashboard/models", None),
            ("/api/dashboard/models/usage", None), ("/api/dashboard/usage", None),
        ]:  # fmt: skip
            d = api.call("GET", path, cookie=t.cookie)
            fs = [] if d.status == 200 else [Finding("bad_status", f"{path}: HTTP {d.status}")]
            run.add(
                L,
                f"dashboard {path}",
                fs + check_no_foreign_rows(path, d.body, foreign_ids, o.markers),
            )
        reqs = api.call("GET", "/api/dashboard/requests?limit=200&range=30d", cookie=t.cookie)
        ids = (
            {i.get("id") for i in (reqs.body or {}).get("items", [])}
            if isinstance(reqs.body, dict)
            else set()
        )
        fs = check_no_foreign_rows(
            "requests", [i for i in ids if i not in t.request_ids], foreign_ids, []
        )
        fs += [
            Finding("foreign_row", f"requests: row {i} is not the tenant's")
            for i in ids
            if i not in t.request_ids
        ]
        run.add(
            L,
            "dashboard requests list",
            fs
            + (
                []
                if reqs.status == 200
                else [Finding("bad_status", f"requests: HTTP {reqs.status}")]
            ),
        )
        # (query text legitimately repeats what the tenant itself asked, so only ids are compared here)
        summ = api.call("GET", "/api/dashboard/analytics/summary?range=30d", cookie=t.cookie)
        total = (summ.body or {}).get("total_requests") if isinstance(summ.body, dict) else None
        fs = (
            []
            if total == t.chat_calls
            else [
                Finding(
                    "foreign_row" if (total or 0) > t.chat_calls else "bad_status",
                    f"analytics total_requests={total}, tenant made {t.chat_calls}",
                )
            ]
        )
        run.add(L, "dashboard analytics summary", fs)
        un = api.call("GET", "/api/dashboard/analytics/unanswered?range=30d", cookie=t.cookie)
        uids = (
            [i.get("id") for i in (un.body or {}).get("items", [])]
            if isinstance(un.body, dict)
            else []
        )
        run.add(
            L,
            "dashboard unanswered list",
            [
                Finding("foreign_row", f"unanswered row {i} is not the tenant's")
                for i in uids
                if i not in t.request_ids
            ],
        )
