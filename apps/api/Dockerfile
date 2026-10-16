# syntax=docker/dockerfile:1
# Production image for beside-pet-api. Multi-stage: build with full deps, then ship
# only the compiled dist + production node_modules. Runtime config (DATABASE_URL,
# JWT_SECRET, ANTHROPIC_API_KEY) is injected by the environment, never baked in.
# The first admin account is created at first run via the one-time setup token
# printed in the boot log (POST /v1/auth/setup) — no credentials in config.

# --- build stage ---------------------------------------------------------------
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

# Install dependencies against the lockfile first (better layer caching).
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Compile (nest build rewrites @/ aliases to relative paths → dist is self-contained),
# then drop dev dependencies so the runtime stage copies a lean node_modules.
COPY . .
RUN pnpm build && pnpm prune --prod

# --- runtime stage -------------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json

# Run as the built-in non-root user.
USER node

EXPOSE 3000
CMD ["node", "dist/main.js"]
