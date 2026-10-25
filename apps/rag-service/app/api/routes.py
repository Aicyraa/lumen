import math
import os
import tempfile
import time
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

import numpy as np
from fastapi import APIRouter, Depends, Form, UploadFile
from fastapi.responses import JSONResponse

from app.api.deps import get_caller, require_secret
from app.api.schemas import QueryRequest, TenantModels
from app.core import limits
from app.core.config import is_production, load_config, router_cfg
from app.core.errors import ApiError
from app.core.logging import log
from app.ingest.chunking import chunk
from app.ingest.extract import DocumentTooLarge, UnreadableDocument, extract_text
from app.llm.prompt import build_prompt, render_answer
from app.retrieval import db, embeddings, reranker, store
from app.retrieval.embeddings import (
    embed,  # loads the model at import, before the server starts listening
)
from app.retrieval.reranker import rerank
from app.retrieval.router import decide

public = APIRouter()
internal = APIRouter(prefix="/internal", dependencies=[Depends(require_secret)])


@public.get("/internal/health")  # no secret; async because it does no blocking work
async def health():
    return {"status": "ok"}


def too_large() -> ApiError:
    return ApiError(422, "document_too_large", "The document is too large to ingest.")


def not_ingestable() -> ApiError:
    return ApiError(409, "document_not_ingestable", "The document was already marked as failed.")


def embed_checked(tenant_id: str, document_id: str, chunks: list[str]) -> np.ndarray:
    """Embed in batches; re-read the document status every few batches so abandoned work stops early."""
    cfg = load_config()["ingest"]
    size, every = cfg["embed_batch_size"], cfg["status_check_every_batches"]
    parts = []
    for n, start in enumerate(range(0, len(chunks), size)):
        if n % every == 0:  # n == 0 also rejects a missing or failed document before any embedding
            status = store.document_status(tenant_id, document_id)
            if status is None:
                raise ApiError(404, "not_found", "Document not found.")
            if status == "failed":
                raise not_ingestable()
        parts.append(embed(chunks[start : start + size]))
    return np.vstack(parts)


@public.get("/internal/ready")  # no secret, like health; plain def because it uses the database
def ready():
    checks = {"database": False, "embedder": embeddings.is_loaded(), "reranker": True}
    try:
        with db.connection(timeout=load_config()["database"]["ready_timeout_seconds"]) as conn:
            conn.execute("SELECT 1")
        checks["database"] = True
    except Exception:  # any failure means not ready; the reason stays out of the response
        pass
    if load_config()["reranker"]["enabled"]:
        checks["reranker"] = reranker.is_loaded()
    ok = all(checks.values())
    return JSONResponse(
        {"status": "ready" if ok else "not_ready", "checks": checks}, status_code=200 if ok else 503
    )


@internal.post("/ingest")
def ingest(
    tenant_id: Annotated[str, Form(min_length=1)],
    document_id: Annotated[UUID, Form()],
    file: UploadFile,
):
    # plain def: FastAPI runs it in its thread pool, so the blocking embed does not stall /internal/health
    suffix = Path(
        file.filename or ""
    ).suffix.lower()  # only the extension is used; the name never touches disk
    with tempfile.NamedTemporaryFile(suffix=suffix) as tmp:
        tmp.write(file.file.read())
        tmp.flush()
        try:
            text = extract_text(tmp.name)
        except UnicodeDecodeError:  # a ValueError subclass, so catch it first
            text = ""
        except UnreadableDocument:
            raise ApiError(422, "unreadable_document", "The PDF could not be read.")
        except DocumentTooLarge:
            raise too_large()
        except ValueError:
            raise ApiError(415, "unsupported_type", "Only PDF, .txt and .md files are supported.")
    if "\x00" in text:  # Postgres text cannot hold NUL; treat the file as unreadable text
        text = ""
    chunks = chunk(text) if text.strip() else []
    if not chunks:
        raise ApiError(422, "no_text_extracted", "No text could be extracted from the file.")
    if len(chunks) > load_config()["ingest"]["max_chunks"]:  # before any embedding work
        raise too_large()
    cfg = load_config()
    try:  # uploads queue for a slot; over the wait the caller gets 503 and may retry
        with limits.slot("ingest", wait=cfg["concurrency"]["ingest_wait_seconds"]):
            vectors = embed_checked(tenant_id, str(document_id), chunks)
    except limits.Busy:
        raise ApiError(
            503,
            "busy",
            "The service is busy. Try again shortly.",
            headers={"Retry-After": str(cfg["concurrency"]["retry_after_seconds"])},
        )
    try:  # one transaction: a failure leaves no chunks
        store.add_chunks(tenant_id, str(document_id), chunks, vectors)
    except store.DocumentMissing:
        raise ApiError(404, "not_found", "Document not found.")
    except store.DocumentNotIngestable:
        raise not_ingestable()
    log.info("ingested tenant=%s document=%s chunks=%d", tenant_id, document_id, len(chunks))
    return {"chunk_count": len(chunks)}


def query_response(
    started: float,
    answer: str,
    sources: list,
    route: dict,
    tokens_in=0,
    tokens_out=0,
    attempts=None,
) -> dict:
    return {
        "request_id": str(uuid4()),
        "answer": answer,
        "sources": sources,
        "route": route,
        "usage": {
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "cost_usd": None,  # Express computes the tenant's estimated cost from its own prices
            "latency_ms": int((time.perf_counter() - started) * 1000),
        },
        "attempts": attempts or [],
    }


def env_default(tier: str) -> list[dict]:
    """The dev/test default model from LLM_* (never in production); empty when not fully set."""
    model_id = os.environ.get(f"LLM_MODEL_{tier.upper()}")
    url, key = os.environ.get("LLM_BASE_URL"), os.environ.get("LLM_API_KEY")
    if is_production() or not (model_id and url and key):
        return []
    return [
        {
            "provider": "openai_compatible",
            "model_id": model_id,
            "endpoint_url": url,
            "api_key": key,
            "tenant_model_id": None,
        }
    ]


def plan_models(tier: str, models: TenantModels | None) -> list[tuple[str, dict]]:
    """Ordered (attempt tier label, model) pairs: the chosen tier, else the other tier."""
    if models is None:
        return [("default", m) for m in env_default(tier)]
    other = "expensive" if tier == "cheap" else "cheap"
    group = (
        tier if getattr(models, tier) else other
    )  # a tier with no models borrows the other tier's
    return [(group, m.model_dump()) for m in getattr(models, group)]


def rate_limited_error(attempts: list) -> ApiError:
    """429 for a tier where every model was rate limited; waits are the soonest any model reports."""
    llm_cfg = load_config()["llm"]
    known = [a.retry_after_seconds for a in attempts if a.retry_after_seconds is not None]
    seconds = min(known) if known else llm_cfg["rate_limit_retry_seconds"]
    if seconds < 60:
        wait = f"{seconds} second{'s' if seconds != 1 else ''}"
    else:
        minutes = math.ceil(seconds / 60)
        wait = f"{minutes} minute{'s' if minutes != 1 else ''}"
    return ApiError(
        429,
        "provider_rate_limited",
        f"The model provider is rate limiting this workspace. Try again in about {wait}.",
        {"attempts": [a.public() for a in attempts]},
        {"retry_after_seconds": seconds},
        {"Retry-After": str(seconds)},
    )


@internal.post("/query")
def query(req: QueryRequest, caller=Depends(get_caller)):
    # plain def: embedding and database calls block, so FastAPI runs this in its thread pool
    started = time.perf_counter()
    messages = load_config()["messages"]
    none_route = {
        "model_tier": "none",
        "k": 0,
        "escalated": False,
        "difficulty": 0.0,
        "top_score": None,
    }
    qvec = embed([req.query])[0]
    cfg = router_cfg()
    reranker_cfg = load_config()["reranker"]
    # one dense search serves best_score and the fusion later; deep enough for the largest k or candidate list
    depth = max(cfg.k_expensive, load_config()["retrieval"]["candidate_limit"])
    if reranker_cfg["enabled"]:
        depth = max(depth, reranker_cfg["candidate_limit"])
    dense = store.dense_search(req.tenant_id, qvec, depth)
    if not dense:  # this tenant has no chunks at all
        return query_response(started, messages["no_documents"], [], none_route)
    best_score = dense[0][3]
    if best_score < cfg.no_answer_score and not store.keyword_search(
        req.tenant_id, qvec, req.query, 1
    ):  # allow BM25 evidence to rescue an exact match before rejecting the question
        return query_response(
            started, messages["not_found"], [], {**none_route, "top_score": best_score}
        )
    route = {**decide(req.query, best_score, cfg), "top_score": best_score}
    if req.force_tier:  # replaces the tier and k only; difficulty stays as decided
        forced_k = cfg.k_expensive if req.force_tier == "expensive" else cfg.k_cheap
        route = {**route, "model_tier": req.force_tier, "k": forced_k, "escalated": False}
    plan = plan_models(route["model_tier"], req.models)
    if not plan:
        raise ApiError(
            422, "no_models_configured", "No models are configured. Add a model in the Models tab."
        )
    candidate_k = (
        max(route["k"], reranker_cfg["candidate_limit"]) if reranker_cfg["enabled"] else route["k"]
    )
    hits = store.search(req.tenant_id, qvec, candidate_k, query_text=req.query, dense=dense)
    hits = rerank(req.query, hits, route["k"]) if reranker_cfg["enabled"] else hits
    system, user = build_prompt(req.query, [content for _, _, content, _ in hits])
    attempts = []
    for label, m in plan:  # top to bottom; the first model that answers wins
        attempts.append(caller(m, label, system, user))
        if attempts[-1].outcome == "ok":
            break
    won = attempts[-1]
    if won.outcome != "ok":
        if all(a.outcome == "rate_limited" for a in attempts):
            raise rate_limited_error(attempts)
        raise ApiError(
            502,
            "provider_error",
            "The language model provider failed. Try again shortly.",
            {"attempts": [a.public() for a in attempts]},
        )
    passages = [content for _, _, content, _ in hits]
    answer = None
    for repair in range(load_config()["llm"]["answer_repair_attempts"] + 1):
        if won.outcome == "ok":
            try:
                answer = render_answer(won.text, passages, messages["not_found"])
                break
            except ValueError:
                pass
        if repair < load_config()["llm"]["answer_repair_attempts"]:
            won = caller(
                m,
                label,
                system
                + "\nYour last response failed validation. Return valid JSON with verbatim quotes and correct passage ids only.",
                user,
            )
            attempts.append(won)
    public = [a.public() for a in attempts]
    if answer is None:
        raise ApiError(
            502,
            "provider_error",
            "The model could not produce a supported answer.",
            {"attempts": public},
        )
    sources = [
        {"document_id": doc_id, "chunk_id": chunk_id, "score": score}
        for chunk_id, doc_id, _, score in hits
    ]
    if req.include_snippets:  # live to the owner only: never stored, never logged
        names = store.filenames(req.tenant_id, [s["document_id"] for s in sources])
        n = load_config()["llm"]["snippet_chars"]
        for s, (_, _, content, _) in zip(sources, hits):
            s["filename"], s["snippet"] = names.get(s["document_id"]), content[:n]
    log.info(
        "query tenant=%s tier=%s k=%d top=%.3f attempts=%d",
        req.tenant_id,
        route["model_tier"],
        route["k"],
        best_score,
        len(attempts),
    )
    return query_response(
        started,
        answer,
        sources,
        route,
        sum(a.tokens_in or 0 for a in attempts),
        sum(a.tokens_out or 0 for a in attempts),
        public,
    )


@internal.delete("/documents/{document_id}")
def delete_document(document_id: UUID, tenant_id: str):
    # tenant_id is a required query parameter; another tenant's id simply matches nothing
    return {"deleted_chunks": store.delete_document(tenant_id, str(document_id))}
