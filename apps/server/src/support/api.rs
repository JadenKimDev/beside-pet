//! 대화 경로의 HTTP 겉(`/v1/sessions`): 인증, 본문 검증, 상태 코드, SSE. 대화의 속은 `SupportService` 에 맡긴다.

use axum::Json;
use axum::Router;
use axum::extract::{FromRef, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};

use super::request::{parse_send_message, parse_start_session};
use super::sse::sse_response;
use super::{
    CancelledTurnResponse, MessageResponse, MindReportResponse, Requester, SessionAnalysisResponse,
    SessionListItemResponse, SessionStateResponse, SharedSupportService, TurnResponse,
};
use crate::identity::{CurrentAccount, SharedAuthenticator};
use crate::shared::{ApiError, JsonBody};

/// 경로는 `/v1` 을 포함한 전체 경로다. 상태에서 대화 서비스와 인증기를 `FromRef` 로 꺼낸다.
/// 인증 추출기가 본문 추출기보다 앞이라 인증이 검증보다 먼저다(Nest 의 가드 → 파이프).
pub fn router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    SharedSupportService: FromRef<S>,
    SharedAuthenticator: FromRef<S>,
{
    Router::new()
        .route("/v1/sessions", post(start).get(list))
        .route("/v1/sessions/stream", post(start_stream))
        .route("/v1/sessions/{id}", get(state).delete(remove))
        .route("/v1/sessions/{id}/messages", post(send).get(history))
        .route("/v1/sessions/{id}/messages/stream", post(send_stream))
        .route("/v1/sessions/{id}/close", post(close))
        .route("/v1/sessions/{id}/analysis", get(analysis))
        .route("/v1/sessions/{id}/report", get(report))
        .route("/v1/sessions/{id}/turns/{turn_id}/stream", get(turn_stream))
        .route(
            "/v1/sessions/{id}/turns/{turn_id}/cancel",
            post(cancel_turn),
        )
        .route("/v1/sessions/{id}/turns/{turn_id}/retry", post(retry_turn))
}

type Service = State<SharedSupportService>;

async fn start(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    JsonBody(body): JsonBody,
) -> Result<(StatusCode, Json<TurnResponse>), ApiError> {
    let request = parse_start_session(&body)?;
    let turn = service.start(&Requester::of(&account), request).await?;
    Ok((StatusCode::CREATED, Json(turn)))
}

async fn start_stream(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    JsonBody(body): JsonBody,
) -> Result<Response, ApiError> {
    let request = parse_start_session(&body)?;
    Ok(sse_response(service.start_stream(Requester::of(&account), request)).await)
}

async fn send(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path(id): Path<String>,
    JsonBody(body): JsonBody,
) -> Result<Json<TurnResponse>, ApiError> {
    let request = parse_send_message(&body)?;
    let turn = service
        .send(&Requester::of(&account), &id, request)
        .await?;
    Ok(Json(turn))
}

async fn send_stream(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path(id): Path<String>,
    JsonBody(body): JsonBody,
) -> Result<Response, ApiError> {
    let request = parse_send_message(&body)?;
    let events = service.send_stream(Requester::of(&account), id, request);
    Ok(sse_response(events).await)
}

async fn close(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path(id): Path<String>,
) -> Result<Json<SessionStateResponse>, ApiError> {
    Ok(Json(service.close(&Requester::of(&account), &id).await?))
}

async fn remove(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    service.delete(&Requester::of(&account), &id).await?;
    Ok(StatusCode::NO_CONTENT.into_response())
}

async fn list(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
) -> Result<Json<Vec<SessionListItemResponse>>, ApiError> {
    Ok(Json(service.list(&Requester::of(&account)).await?))
}

async fn state(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path(id): Path<String>,
) -> Result<Json<SessionStateResponse>, ApiError> {
    Ok(Json(service.state(&Requester::of(&account), &id).await?))
}

async fn history(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path(id): Path<String>,
) -> Result<Json<Vec<MessageResponse>>, ApiError> {
    Ok(Json(service.history(&Requester::of(&account), &id).await?))
}

async fn analysis(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path(id): Path<String>,
) -> Result<Json<SessionAnalysisResponse>, ApiError> {
    Ok(Json(service.analysis(&Requester::of(&account), &id).await?))
}

async fn report(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path(id): Path<String>,
) -> Result<Json<MindReportResponse>, ApiError> {
    Ok(Json(service.report(&Requester::of(&account), &id).await?))
}

/// 턴의 답에 다시 붙는다(ADR-0030). 소유 확인과 409 는 서비스가 첫 항목으로 낸다.
async fn turn_stream(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path((id, turn_id)): Path<(String, String)>,
) -> Response {
    sse_response(service.turn_stream(Requester::of(&account), id, turn_id)).await
}

async fn cancel_turn(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path((id, turn_id)): Path<(String, String)>,
) -> Result<Json<CancelledTurnResponse>, ApiError> {
    let cancelled = service
        .cancel_turn(&Requester::of(&account), &id, &turn_id)
        .await?;
    Ok(Json(cancelled))
}

/// 실패한 턴의 답만 다시 받는다. 응답은 `/messages/stream` 과 같다.
async fn retry_turn(
    State(service): Service,
    CurrentAccount(account): CurrentAccount,
    Path((id, turn_id)): Path<(String, String)>,
) -> Response {
    sse_response(service.retry_turn(Requester::of(&account), id, turn_id)).await
}

#[cfg(test)]
mod tests;
