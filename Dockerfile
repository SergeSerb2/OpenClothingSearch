# Container image for running the finder on a server (for example Fly.io, see fly.toml).
# The server has no screen: the search browser runs hidden, so Taobao and 1688 site search
# mostly hit slider checks there. Everything else works.

FROM node:22-slim AS web
WORKDIR /web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm run bundle

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/server \
    UV_SYSTEM_PYTHON=1 \
    HF_HOME=/app/data/hf \
    FINDER_HOST=0.0.0.0 \
    FINDER_PORT=8080 \
    BROWSER_MODE=hidden
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app/server
COPY server/pyproject.toml server/uv.lock ./
# CPU-only torch: the default Linux build includes CUDA (several GB) and a server has no GPU.
RUN uv pip install --system torch==2.14.1 torchvision==0.29.1 --index-url https://download.pytorch.org/whl/cpu \
 && uv export --frozen --no-hashes --no-dev --no-emit-project \
    | grep -viE '^(nvidia-|cuda-|triton|torch==|torchvision==)' > /tmp/requirements.txt \
 && uv pip install --system -r /tmp/requirements.txt \
 && rm -rf /root/.cache/uv
# Chromium and its system libraries, plus Chinese fonts for the pages it opens.
RUN patchright install --with-deps chromium \
 && apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*
COPY server/finder ./finder
COPY --from=web /web/dist /app/web/dist
EXPOSE 8080
CMD ["python", "-c", "from finder.app import main; main()"]
