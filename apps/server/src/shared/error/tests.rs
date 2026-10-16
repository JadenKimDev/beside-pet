use axum::body::to_bytes;
use axum::http::{Method, StatusCode};
use axum::response::IntoResponse;
use serde_json::{Value, json};

use super::{ApiError, Message};

async fn render(error: ApiError) -> (StatusCode, Value) {
    let response = error.into_response();
    let status = response.status();
    let content_type = response
        .headers()
        .get("content-type")
        .unwrap()
        .to_str()
        .unwrap()
        .to_owned();
    assert!(
        content_type.starts_with("application/json"),
        "{content_type}"
    );
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn 검증_오류는_문구의_배열이다() {
    let error = ApiError::BadRequest(Message::Many(vec![
        "username must be a string".into(),
        "password must be a string".into(),
    ]));
    let (status, body) = render(error).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        body,
        json!({
            "statusCode": 400,
            "message": ["username must be a string", "password must be a string"],
            "error": "Bad Request"
        })
    );
}

#[tokio::test]
async fn 한_줄짜리_400_도_낸다() {
    let (status, body) = render(ApiError::bad_request(
        "No prior session to continue; onboarding is required.",
    ))
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert_eq!(
        body,
        json!({
            "statusCode": 400,
            "message": "No prior session to continue; onboarding is required.",
            "error": "Bad Request"
        })
    );
}

#[tokio::test]
async fn 상태마다_표준_문구를_붙인다() {
    let cases = [
        (
            ApiError::Unauthorized("Not authenticated".into()),
            401,
            "Not authenticated",
            "Unauthorized",
        ),
        (
            ApiError::Forbidden("Insufficient role".into()),
            403,
            "Insufficient role",
            "Forbidden",
        ),
        (
            ApiError::NotFound("Account not found".into()),
            404,
            "Account not found",
            "Not Found",
        ),
        (
            ApiError::Conflict("Setup is already complete".into()),
            409,
            "Setup is already complete",
            "Conflict",
        ),
        (
            ApiError::NotImplemented,
            501,
            "Not implemented",
            "Not Implemented",
        ),
        (
            ApiError::Internal,
            500,
            "Internal server error",
            "Internal Server Error",
        ),
    ];
    for (error, code, message, phrase) in cases {
        let (status, body) = render(error).await;
        assert_eq!(status.as_u16(), code);
        assert_eq!(
            body,
            json!({ "statusCode": code, "message": message, "error": phrase })
        );
    }
}

#[tokio::test]
async fn 없는_경로는_cannot_메서드_경로다() {
    let error = ApiError::route_not_found(&Method::GET, "/v1/nope?x=1");
    let (status, body) = render(error).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert_eq!(
        body,
        json!({ "statusCode": 404, "message": "Cannot GET /v1/nope?x=1", "error": "Not Found" })
    );
}

#[test]
fn 상태_코드를_알려_준다() {
    assert_eq!(
        ApiError::NotImplemented.status(),
        StatusCode::NOT_IMPLEMENTED
    );
    assert_eq!(
        ApiError::Internal.status(),
        StatusCode::INTERNAL_SERVER_ERROR
    );
}
