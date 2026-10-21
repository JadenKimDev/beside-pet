# syntax=docker/dockerfile:1
# 운영 화면(@beside-pet/backoffice)의 이미지. 빌드 컨텍스트는 레포 루트다(pnpm 워크스페이스가 루트에 있다).
#   docker build -f apps/backoffice/Dockerfile --build-arg API_BASE_URL=http://host.docker.internal:8000 .
# 무엇이 컨텍스트에 들어가는지는 apps/backoffice/Dockerfile.dockerignore 가 정한다.
#
# API 는 브라우저가 아니라 Next 서버가 부른다: 브라우저는 같은 출처의 /v1/... 을 부르고 next.config.ts 의
# rewrites 가 API_BASE_URL 의 /v1/... 로 넘긴다. 그래서 NEXT_PUBLIC_* 값은 없다.
# 다만 rewrites 는 next build 때 routes-manifest 에 굳으므로 API_BASE_URL 은 런타임 환경 변수가 아니라
# 빌드 인자로 받는다. 다른 API 를 보려면 이미지를 다시 빌드한다. 브라우저 번들에는 들어가지 않는다.

# --- 빌드: 워크스페이스 매니페스트만 먼저 복사해 의존성 설치 층을 소스 변경과 떼어 둔다.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backoffice/package.json apps/backoffice/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @beside-pet/backoffice...

ARG API_BASE_URL=http://127.0.0.1:3000
ENV API_BASE_URL=$API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY apps/backoffice apps/backoffice
RUN pnpm -F @beside-pet/backoffice build

# --- 런타임: standalone 출력만 싣는다(next.config.ts 의 output: 'standalone').
# 모노레포에서는 standalone/ 아래에 워크스페이스 루트 모양(apps/backoffice/server.js 와 루트 node_modules)으로 나온다.
# .next/static 은 standalone 에 들어가지 않으므로 server.js 옆 자리에 따로 복사한다. public/ 은 없다.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build --chown=node:node /app/apps/backoffice/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/backoffice/.next/static ./apps/backoffice/.next/static

USER node

# standalone server.js 는 PORT 와 HOSTNAME 을 본다. 컨테이너 밖의 포트는 compose 가 루프백에만 묶는다.
ENV PORT=3002
ENV HOSTNAME=0.0.0.0
EXPOSE 3002
CMD ["node", "apps/backoffice/server.js"]
