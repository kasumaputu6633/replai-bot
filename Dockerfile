# syntax=docker/dockerfile:1

ARG NODE_VERSION=24.18.0

FROM node:${NODE_VERSION}-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/bot/package.json apps/bot/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/core/package.json packages/core/package.json

RUN pnpm install --frozen-lockfile

COPY apps ./apps
COPY packages ./packages

RUN pnpm build \
    && pnpm --filter @replai/bot deploy --prod /prod/bot \
    && pnpm --filter @replai/api deploy --prod /prod/api

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app
RUN mkdir -p /app/data && chown node:node /app/data
USER node

FROM runtime AS bot
COPY --from=build --chown=node:node /prod/bot ./
CMD ["node", "dist/index.js"]

FROM runtime AS api
COPY --from=build --chown=node:node /prod/api ./
EXPOSE 3000
CMD ["node", "dist/index.js"]

# Default PaaS image. Railway builds the final stage and selects the process
# with a per-service start command, while Compose still targets bot/api above.
FROM runtime AS railway
LABEL org.opencontainers.image.source="https://github.com/kasumaputu6633/replai-bot"
LABEL org.opencontainers.image.title="Replai"
LABEL org.opencontainers.image.description="Discord-native contextual research assistant"
COPY --from=build --chown=node:node /prod/bot ./bot
COPY --from=build --chown=node:node /prod/api ./api
EXPOSE 3000
CMD ["node", "api/dist/index.js"]
