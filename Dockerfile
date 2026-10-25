FROM node:24-bookworm-slim

WORKDIR /workspace
RUN mkdir -p .agents/skills && corepack enable && corepack prepare pnpm@12.11.2 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps ./apps
COPY packages ./packages
COPY corpus ./corpus
COPY tsconfig.base.json ./tsconfig.base.json

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @nova/shared build \
  && pnpm --filter @nova/model-runtime build \
  && pnpm --filter @nova/api build \
  && pnpm --filter @nova/web build

EXPOSE 3001 5173
