//! 라우터와 상태(`AppState`)를 조립한다. 기능의 라우트와 trait 객체는 여기서 끼운다.

use std::sync::Arc;

use axum::routing::get;
use axum::{Json, Router};
use serde_json::{Value, json};
use sqlx::PgPool;

use crate::shared::{Config, connect, connect_lazy, cors_layer, route_not_found};

/// 핸들러가 받는 상태. 복제가 싸야 하므로 칸은 `Arc` 나 풀(안이 `Arc`)로 둔다.
/// 기능의 trait 객체(`Arc<dyn AccountService>` 등)는 칸으로 더하고, 기능의 라우터는 `FromRef` 로 필요한 칸만 꺼낸다.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: PgPool,
}

impl AppState {
    /// DB 에 붙고 마이그레이션까지 마친 상태.
    pub async fn connect(config: Arc<Config>) -> Result<AppState, sqlx::Error> {
        let db = connect(&config).await?;
        Ok(AppState { config, db })
    }

    /// DB 에 붙지 않은 상태(풀은 처음 쓸 때 붙는다). DB 를 쓰지 않는 라우터 테스트가 쓴다.
    pub fn lazy(config: Arc<Config>) -> Result<AppState, sqlx::Error> {
        let db = connect_lazy(&config)?;
        Ok(AppState { config, db })
    }
}

/// 모든 경로는 `/v1` 아래다. 없는 경로와 메서드가 맞지 않는 경로는 Nest(Express)와 같이 `404 Cannot <METHOD> <path>` 다.
pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/v1/health", get(health))
        .fallback(route_not_found)
        .method_not_allowed_fallback(route_not_found)
        .layer(cors_layer())
        .with_state(state)
}

async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

#[cfg(test)]
mod tests;
