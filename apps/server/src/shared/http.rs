//! HTTP 의 공통 조각: JSON 본문 추출기, CORS, 없는 경로의 404.

use axum::body::Bytes;
use axum::extract::{FromRequest, Request};
use axum::http::header::CONTENT_TYPE;
use axum::http::{HeaderValue, Method, Uri};
use serde_json::{Map, Value};
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};

use super::ApiError;

/// 요청 본문을 `serde_json::Value` 로 읽는다. Express 의 JSON 파서처럼 JSON 이 아니거나 비어 있으면 빈 객체다.
/// 깨진 JSON 은 Nest 모양의 400 이고, 문구에 본문을 싣지 않는다. 검증은 `Validator` 가 이어서 한다.
#[derive(Debug, Clone)]
pub struct JsonBody(pub Value);

impl<S: Send + Sync> FromRequest<S> for JsonBody {
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<JsonBody, ApiError> {
        let is_json = request
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .is_some_and(|v| {
                let essence = v
                    .split(';')
                    .next()
                    .unwrap_or("")
                    .trim()
                    .to_ascii_lowercase();
                essence == "application/json" || essence.ends_with("+json")
            });
        let bytes = Bytes::from_request(request, state)
            .await
            .map_err(|_| ApiError::bad_request("Request body could not be read"))?;
        if !is_json || bytes.iter().all(u8::is_ascii_whitespace) {
            return Ok(JsonBody(Value::Object(Map::new())));
        }
        serde_json::from_slice(&bytes)
            .map(JsonBody)
            .map_err(|_| ApiError::bad_request("Request body is not valid JSON"))
    }
}

/// 쿠키를 실은 브라우저 요청을 `allowed` 의 출처에만 허용한다. 목록 안 출처는 그 출처를 그대로 돌려주고
/// `Allow-Credentials: true` 이며, 목록 밖 출처에는 `Access-Control-Allow-Origin` 을 내지 않는다.
/// `allowed` 가 `None`(sandbox 에서 `ALLOWED_ORIGINS` 가 없을 때)이면 요청의 출처를 그대로 돌려준다.
/// 목록의 칸은 `Config` 가 헤더 값으로 쓸 수 있는지 이미 확인했다.
pub fn cors_layer(allowed: Option<&[String]>) -> CorsLayer {
    let origin = match allowed {
        Some(list) => AllowOrigin::list(
            list.iter()
                .filter_map(|v| HeaderValue::from_str(v).ok())
                .collect::<Vec<_>>(),
        ),
        None => AllowOrigin::mirror_request(),
    };
    CorsLayer::new()
        .allow_origin(origin)
        .allow_credentials(true)
        .allow_methods(AllowMethods::mirror_request())
        .allow_headers(AllowHeaders::mirror_request())
}

/// 라우터의 fallback: `404 Cannot <METHOD> <path>`.
pub async fn route_not_found(method: Method, uri: Uri) -> ApiError {
    let path = uri
        .path_and_query()
        .map_or_else(|| uri.path(), |pq| pq.as_str());
    ApiError::route_not_found(&method, path)
}

#[cfg(test)]
mod tests;
