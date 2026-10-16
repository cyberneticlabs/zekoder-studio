# Serves the versioned docs site from a read-only bucket mount at /srv/docs.
# Build context: scripts/docs-release/
FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402
WORKDIR /app
COPY serve.mjs ./
ENV DOCS_ROOT=/srv/docs
USER node
CMD ["node", "serve.mjs"]
