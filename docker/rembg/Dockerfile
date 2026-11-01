# SPDX-License-Identifier: AGPL-3.0-only
# rembg's HTTP server with one model built in, u2net (Apache-2.0), for the rembg profile in
# docker-compose.yml. Published as ghcr.io/movm/ggraphic-rembg for linux/amd64 and linux/arm64
# (rembg-image.yml). rembg's own image is not used: it is amd64 only, and it carries the bria-rmbg
# weights, whose licence needs a paid agreement for commercial use.

FROM python:3.12-slim

ARG REMBG_VERSION=2.0.86
LABEL org.opencontainers.image.title="rembg for ggraphic Studio" \
      org.opencontainers.image.description="rembg's HTTP server with the u2net model (Apache-2.0) only" \
      org.opencontainers.image.source="https://github.com/Movm/ggraphic" \
      org.opencontainers.image.url="https://github.com/Movm/ggraphic" \
      org.opencontainers.image.documentation="https://github.com/Movm/ggraphic/blob/main/docs/self-hosting.md#remove-background" \
      org.opencontainers.image.licenses="MIT AND Apache-2.0" \
      org.opencontainers.image.version="${REMBG_VERSION}"

# rembg's `cli` extra without gradio, the dependency of its web UI (switched off below) and the
# biggest one. The ranges are the extra's, from rembg 2.0.86.
RUN pip install --no-cache-dir "rembg[cpu]==${REMBG_VERSION}" \
      "aiohttp>=3.13.2,<4" "asyncer>=0.0.12,<0.0.13" "click>=8.3.1,<9" \
      "fastapi>=0.128.0,<0.129.0" "filetype>=1.2.0,<2" "python-multipart>=0.0.21,<0.0.22" \
      "sniffio>=1.3.1,<2" "uvicorn>=0.40.0,<0.41.0" "watchdog>=6.0.0,<7"

# The model is downloaded (and its checksum checked) now, so the container needs no network.
ENV U2NET_HOME=/models \
    NUMBA_CACHE_DIR=/tmp/numba
RUN rembg d u2net

USER nobody
EXPOSE 7000
# Studio asks for the model with every image (REMBG_MODEL, default u2net).
ENTRYPOINT ["rembg", "s", "--host", "0.0.0.0", "--port", "7000", "--no-ui"]
