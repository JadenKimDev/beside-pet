//! Nest 모양의 오류 본문 `{ statusCode, message, error }` 과 그 HTTP 응답.

use axum::Json;
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Serialize;

/// `message` 칸: 한 줄 또는 줄의 배열(검증 오류).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum Message {
    One(String),
    Many(Vec<String>),
}

/// 핸들러와 기능이 돌려주는 오류. 문구에는 대화 본문이나 사용자 식별 정보를 싣지 않는다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ApiError {
    BadRequest(Message),
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    Conflict(String),
    /// 아직 구현이 없는 기능: `501 Not implemented`.
    NotImplemented,
    /// 알 수 없는 실패: `500 Internal server error`. 원인은 부른 쪽이 로그로 남긴다.
    Internal,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Body<'a> {
    status_code: u16,
    message: &'a Message,
    error: &'a str,
}

impl ApiError {
    /// 한 줄짜리 400.
    pub fn bad_request(message: impl Into<String>) -> ApiError {
        ApiError::BadRequest(Message::One(message.into()))
    }

    /// 없는 경로: `404 Cannot <METHOD> <path>` (Nest 와 같이 질의 문자열까지 싣는다).
    pub fn route_not_found(method: &Method, path_and_query: &str) -> ApiError {
        ApiError::NotFound(format!("Cannot {method} {path_and_query}"))
    }

    pub fn status(&self) -> StatusCode {
        match self {
            ApiError::BadRequest(_) => StatusCode::BAD_REQUEST,
            ApiError::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            ApiError::Forbidden(_) => StatusCode::FORBIDDEN,
            ApiError::NotFound(_) => StatusCode::NOT_FOUND,
            ApiError::Conflict(_) => StatusCode::CONFLICT,
            ApiError::NotImplemented => StatusCode::NOT_IMPLEMENTED,
            ApiError::Internal => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn message(&self) -> Message {
        match self {
            ApiError::BadRequest(message) => message.clone(),
            ApiError::Unauthorized(m)
            | ApiError::Forbidden(m)
            | ApiError::NotFound(m)
            | ApiError::Conflict(m) => Message::One(m.clone()),
            ApiError::NotImplemented => Message::One("Not implemented".to_owned()),
            ApiError::Internal => Message::One("Internal server error".to_owned()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = self.status();
        let message = self.message();
        let body = Body {
            status_code: status.as_u16(),
            message: &message,
            error: status.canonical_reason().unwrap_or("Error"),
        };
        (status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests;
