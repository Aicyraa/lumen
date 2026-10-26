# Build context: the repository root (pnpm workspace + infra/sql).
#   docker build -f apps/api/Dockerfile -t lumen-api .
# Runs `tsx src/server.ts` like `pnpm start`; there is no compiled build in this repo, and tsx is a devDependency, so dev dependencies are installed.
FROM node:24-slim

RUN corepack enable
WORKDIR /app

# Manifests first so the install layer is cached until a dependency changes (pnpm needs every workspace package.json for --frozen-lockfile).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/rag-service/package.json apps/rag-service/
# Caches are deleted in the layer that creates them, or they stay in the image (about 180 MB).
RUN pnpm install --frozen-lockfile --filter @lumen/api... --store-dir /tmp/pnpm-store && rm -rf /tmp/pnpm-store /root/.cache

COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY infra/sql infra/sql

# Uploads are scratch space (deleted after ingest, swept at start); a volume is optional. Own it so the non-root user can write.
RUN mkdir -p apps/api/uploads && chown node:node apps/api/uploads
USER node
WORKDIR /app/apps/api

ENV NODE_ENV=production PORT=3000
EXPOSE 3000
# No health route in the API: Better Auth's /api/auth/ok answers {"ok":true} without touching the database.
# The forwarded-for header keeps Better Auth's rate limiter from warning that it cannot tell the client address.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/auth/ok',{headers:{'x-forwarded-for':'127.0.0.1'}}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# Same as `pnpm start` (tsx src/server.ts) without the pnpm wrapper: node is PID 1, so SIGTERM reaches the graceful shutdown in server.ts.
CMD ["node", "--import", "tsx", "src/server.ts"]
