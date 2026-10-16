//! safety 의 HTTP 겉: `GET /v1/safety/resources`. TS 컨트롤러와 같이 인증을 요구하지 않는다.

use axum::routing::get;
use axum::{Json, Router};

use super::{SafetyResource, safety_resources};

/// 상태를 쓰지 않으므로 어떤 상태의 라우터에도 끼운다.
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
{
    Router::new().route("/v1/safety/resources", get(resources))
}

async fn resources() -> Json<&'static [SafetyResource]> {
    Json(safety_resources())
}

#[cfg(test)]
mod tests;
