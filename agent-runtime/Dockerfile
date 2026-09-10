FROM node:22-slim

ARG INSTALL_CODEX=true

ENV DEBIAN_FRONTEND=noninteractive
ENV CODEX_HOME=/auth/codex
ENV NPM_CONFIG_PREFIX=/opt/npm-global
ENV PATH=/opt/npm-global/bin:/opt/trading-tools/node_modules/.bin:$PATH
ENV NODE_PATH=/opt/trading-tools/node_modules

WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    jq \
    openssh-client \
    python3 \
    python3-pip \
    python3-venv \
    ripgrep \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt/trading-tools /opt/npm-global /auth/codex \
  && chown -R node:node /opt/trading-tools /opt/npm-global /auth/codex /workspace

COPY --chown=node:node --chmod=755 agent-runtime/entrypoint.sh /usr/local/bin/codex-agent-entrypoint

USER node

RUN if [ "$INSTALL_CODEX" = "true" ]; then npm install -g @openai/codex; fi

COPY --chown=node:node package/package.json package/package-lock.json package/.npmrc /opt/package/
RUN cd /opt/package && npm ci

COPY --chown=node:node package/ /opt/package/
RUN cd /opt/package && npm run build && npm prune --omit=dev

COPY --chown=node:node agent-runtime/package.json agent-runtime/package-lock.json agent-runtime/.npmrc /opt/trading-tools/
RUN cd /opt/trading-tools && npm ci --omit=dev

ENTRYPOINT ["codex-agent-entrypoint"]
CMD ["codex", "--help"]
