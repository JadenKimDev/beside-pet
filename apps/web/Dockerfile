# syntax=docker/dockerfile:1
# Production image for beside-pet-web. Multi-stage: build with full deps, then
# ship only the standalone server output (next.config.ts sets output: 'standalone').
#
# NEXT_PUBLIC_* values are INLINED AT BUILD TIME by Next, so they arrive as build
# args, not runtime env:
#   --build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
# An empty NEXT_PUBLIC_API_BASE_URL means same-origin relative requests — the
# right setting when one domain routes /v1/* to the API in front of both apps.

# --- build stage ---------------------------------------------------------------
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

COPY . .
RUN pnpm build

# --- runtime stage -------------------------------------------------------------
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The standalone output bundles server.js with its own pruned node_modules;
# static assets and public/ are served from the paths Next expects.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

USER node

ENV PORT=3001
EXPOSE 3001
CMD ["node", "server.js"]
