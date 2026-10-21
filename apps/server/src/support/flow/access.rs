//! 세션에 닿는 관문: 찾고(없으면 404), 소유자를 확인하고(아니면 403, 관리자는 통과), 세션 규칙의 어김을 HTTP 로 옮긴다.
//!
//! 관리자가 남의 세션을 보는 것은 ADR-0006 의 지금 동작이다. 문구에는 세션 id 만 싣는다(TS 와 같은 문구).

use super::outside::SessionRepository;
use crate::shared::ApiError;
use crate::support::Requester;
use crate::support::session::{Session, SessionError};

pub const NOT_OWNER: &str = "Not the owner of this session";
const REPORT_UNAVAILABLE: &str = "The report is not available for this session yet.";

/// 세션을 되살린다. 없으면 404, 남의 것이면 403.
pub async fn require(
    sessions: &(dyn SessionRepository + Send + Sync),
    id: &str,
    requester: &Requester,
) -> Result<Session, ApiError> {
    let snapshot = sessions
        .find(id)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Session not found: {id}")))?;
    if snapshot.owner_id != requester.account_id && !requester.is_admin {
        return Err(ApiError::Forbidden(NOT_OWNER.to_owned()));
    }
    Ok(Session::rehydrate(snapshot))
}

/// 세션 규칙의 어김은 409 다.
pub fn session_conflict(id: &str, error: SessionError) -> ApiError {
    match error {
        SessionError::Closed => ApiError::Conflict(format!("Session is already closed: {id}")),
        SessionError::ReportUnavailable | SessionError::ReportAlreadyWritten => {
            ApiError::Conflict(REPORT_UNAVAILABLE.to_owned())
        }
        SessionError::TurnAlreadyReceived
        | SessionError::TurnNotFound
        | SessionError::TurnNotPending => ApiError::Conflict("Turn already received".to_owned()),
    }
}
