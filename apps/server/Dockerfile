# syntax=docker/dockerfile:1
# Rust 서버(beside-pet-server)의 운영 이미지. 빌드 컨텍스트는 레포 루트다(Cargo 워크스페이스가 루트에 있다).
#   docker build -f apps/server/Dockerfile .
# 플랫폼은 빌드하는 머신의 것(이 레포의 기준은 arm64)이고, 환경 변수 값은 이미지에 굽지 않는다.

# --- 빌드: 레지스트리와 target/ 은 캐시 마운트에 두어 다시 빌드할 때 의존성을 다시 받지도 짓지도 않는다.
FROM rust:1.99-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY apps/server/Cargo.toml apps/server/Cargo.toml
COPY apps/server/src apps/server/src
COPY apps/server/migrations apps/server/migrations
# 마이그레이션은 sqlx::migrate! 가 바이너리에 박으므로 런타임 단계에는 복사하지 않는다.
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/src/target \
    cargo build --release --locked -p beside-pet-server \
    && cp target/release/beside-pet-server /beside-pet-server

# --- 런타임: glibc 만 있는 distroless(TLS 는 rustls 라 OpenSSL 이 필요 없다). 비루트(uid 65532).
FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=build /beside-pet-server /app/beside-pet-server
# 서버는 작업 디렉터리 기준 상대 경로 rag-knowledge/grief-knowledge.json 을 읽는다.
COPY apps/server/rag-knowledge/grief-knowledge.json /app/rag-knowledge/grief-knowledge.json
USER nonroot:nonroot
EXPOSE 3000
ENTRYPOINT ["/app/beside-pet-server"]
