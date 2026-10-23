# Tech stack

- rag-service: Python >=3.11, FastAPI, uvicorn, sentence-transformers `all-MiniLM-L6-v2` (384-dim, so `VECTOR(384)`), pypdf, psycopg[binary], pgvector, numpy, pydantic, pyyaml, pytest. LLM via `openai` SDK on OpenAI-compatible endpoint (Groq).
- api: Node LTS, ESM only, Express, zod, multer, express-rate-limit, cors, pino, better-auth (+organization, api-key plugins); tests Vitest+supertest.
- web: React, Vite, React Router, TanStack Query.
- DB: Postgres 16 + pgvector (`pgvector/pgvector:pg16`); Supabase in prod (direct connections only, no Data API/service_role).
- Containers: Podman only on dev machine (no compose provider; use `podman run`). Host Postgres already owns port 5432, so dev DB container uses 5433.
- `.env` currently holds Supabase-style `DB_DIRECT_CONNECTION`/`DB_TRANSACTION_POOLER`, not the brief's `DATABASE_URL`; never print values.
