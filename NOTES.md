# Notes

## 2026-10-23

- Phase 0 scaffold created: folders, docker-compose.yml, .env.example, infra/sql/001_app_tables.sql, README.

- Phase 0 acceptance checked by lead (Podman, no compose provider): db container starts; `\dx` lists vector 0.8.7; 001_app_tables.sql applies cleanly creating documents, chunks, request_logs; `.env` git-ignored and untracked. PASSED.
- Host port 5432 is taken by a system Postgres, so the dev DB maps to host port 5433 (`docker-compose.yml`, `DATABASE_URL` in `.env`).
- Podman equivalent of `docker compose up -d db`: `podman run -d --name lumen-db -p 5433:5432 -e POSTGRES_PASSWORD=$POSTGRES_PASSWORD -e POSTGRES_DB=lumen -v lumen_db_data:/var/lib/postgresql/data docker.io/pgvector/pgvector:pg16`

## 2026-10-23 Phase 1 (RAG core)

- Built by rag-engineer on `phase-1-rag-core`; test-first (`test:` red stubs before each `feat:`). Python 3.14 worked with torch/sentence-transformers.
- Lead checks: pytest 16 passed; every SQL in store.py filters tenant_id; ask.py re-run on the sample handbook gave the right chunk in the top 3 (engineer's 5-question table: rank 1 for all, refund also rank 2); dev DB cleaned afterwards. lumen-reviewer: no blocking findings.
- Known: chunk() defaults 120/30 in code (dictated by prompt); delete_document count not atomic under concurrent inserts; embeddings load at import (~3s).
