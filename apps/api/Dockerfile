# syntax=docker/dockerfile:1
#
# Multi-stage build for the AI Concierge API (apps/api).
#
# Build from the REPO ROOT so the pnpm workspace and lockfile are in context:
#   docker build -f apps/api/Dockerfile -t concierge-api .
#
# Stage layout:
#   base    - Node 22 + pnpm (pinned via corepack to the workspace version)
#   deps    - full workspace install (needed to build api + its workspace deps)
#   build   - compile apps/api to dist/ with the turbo build graph
#   prod-deps - production-only node_modules for a slim runtime
#   runtime - minimal image: prod node_modules + compiled dist/, non-root user

# ----------------------------------------------------------------------------
FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# HUSKY=0 disables the root `prepare` git-hook install, which is a dev-only
# concern and fails in the container (husky is not present in prod installs).
ENV HUSKY=0
# Pin pnpm to the workspace's packageManager version via corepack.
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app

# ----------------------------------------------------------------------------
# deps: install the FULL workspace (dev + prod) so the build has everything.
FROM base AS deps
# Copy only manifests first for better layer caching.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/ui/package.json packages/ui/package.json
# Frozen install against the committed lockfile. --ignore-scripts skips the
# root `prepare` (husky git-hook) lifecycle, which is irrelevant in CI/Docker.
RUN pnpm install --frozen-lockfile --ignore-scripts

# ----------------------------------------------------------------------------
# build: bring in sources and compile just the api (turbo builds its deps too).
FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
# Build only the api target and its workspace dependency graph.
RUN pnpm --filter api build

# ----------------------------------------------------------------------------
# prod-deps: a clean production-only install for a slim runtime image.
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/ui/package.json packages/ui/package.json
# --ignore-scripts: the prod install must not run the root `prepare` (husky)
# lifecycle -- husky is a devDependency absent from a --prod tree, and git
# hooks are irrelevant inside the image.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts --filter api...

# ----------------------------------------------------------------------------
# runtime: minimal image with production deps + compiled output.
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Non-root user for the running process.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nodejs

# Production node_modules (root hoisted + api-local) and compiled dist.
COPY --from=prod-deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=prod-deps --chown=nodejs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/package.json

USER nodejs
WORKDIR /app/apps/api

EXPOSE 8000
ENV PORT=8000

# Container-native healthcheck against the /health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8000)+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
