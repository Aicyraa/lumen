# Build context: apps/rag-service.   docker build -t lumen-rag apps/rag-service
# CPU-only torch, models baked in (the pinned revisions from app/config.yaml), no Hugging Face access at runtime.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app

# torch is not in constraints.txt (CI installs the CPU wheel first, so does this); the default PyPI wheel pulls CUDA libraries.
RUN pip install torch --index-url https://download.pytorch.org/whl/cpu

# Dependencies only (the app itself runs from /app, it is not installed): read them from pyproject.toml, pinned by constraints.txt.
COPY pyproject.toml constraints.txt ./
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('pyproject.toml','rb'))['project']['dependencies']))" > /tmp/deps.txt \
 && pip install -c constraints.txt -r /tmp/deps.txt

COPY app ./app
# Fails the build when a download fails. HF_HOME is scratch so the Hugging Face cache does not stay in the image.
# chmod: the saved weights are mode 0600 (root), which the non-root user below could not read.
RUN HF_HOME=/tmp/hf python -m app.cli download-models && rm -rf /tmp/hf && chmod -R a+rX app/models

RUN useradd --create-home --uid 10001 app
USER app

# RAG_HOST=0.0.0.0 only because inside a container 127.0.0.1 is unreachable from the platform's private network; the CLI default stays
# 127.0.0.1. Never publish this port to the internet: the host must expose it to the private network only (see infra/DEPLOY.md).
ENV NODE_ENV=production RAG_HOST=0.0.0.0 RAG_PORT=8000 RAG_WORKERS=1 HF_HUB_OFFLINE=1 TOKENIZERS_PARALLELISM=false
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD ["python", "-c", "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/internal/health' % os.environ['RAG_PORT'], timeout=4)"]
CMD ["python", "-m", "app.cli", "serve"]
