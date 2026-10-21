# syntax=docker/dockerfile:1
# 대화 웹(@beside-pet/web)의 운영 이미지. 빌드 컨텍스트는 레포 루트다(pnpm 워크스페이스가 루트에 있다).
#   docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 .
# 무엇이 컨텍스트에 들어가는지는 apps/web/Dockerfile.dockerignore 가 정한다.
#
# NEXT_PUBLIC_* 값은 next build 때 번들에 박히므로 런타임 환경 변수가 아니라 빌드 인자로 받는다.
# 빈 NEXT_PUBLIC_API_BASE_URL 은 같은 출처의 상대 요청이다(한 도메인이 /v1/* 를 API 로 보낼 때).

# --- 빌드: 워크스페이스 매니페스트만 먼저 복사해 의존성 설치 층을 소스 변경과 떼어 둔다.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @beside-pet/web...

ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_TELEMETRY_DISABLED=1

COPY showcase showcase
COPY apps/web apps/web
RUN pnpm -F @beside-pet/web build

# --- 런타임: standalone 출력만 싣는다(next.config.ts 의 output: 'standalone').
# 모노레포에서는 standalone/ 아래에 워크스페이스 루트 모양(apps/web/server.js 와 루트 node_modules)으로 나온다.
# .next/static 과 public 은 standalone 에 들어가지 않으므로 server.js 옆 자리에 따로 복사한다.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./apps/web/public

USER node

# standalone server.js 는 PORT 와 HOSTNAME 을 본다. 컨테이너 밖의 포트는 compose 가 루프백에만 묶는다.
ENV PORT=3001
ENV HOSTNAME=0.0.0.0
EXPOSE 3001
CMD ["node", "apps/web/server.js"]
