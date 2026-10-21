//! 중단: 답을 기다리거나 받는 턴을 멈춘다(ADR-0030). 이미 중단된 턴이면 같은 응답이고(멱등), 끝났거나 실패한 턴은 409 다.
//!
//! 등록부에 있는 턴은 중단 토큰만 당기고 저장은 그 턴을 돌리는 흐름이 한다(쓰는 쪽은 하나다). 흐름이 저장을 마치고 등록부에서
//! 빠질 때까지 기다린 뒤 저장소의 턴으로 답한다. 위기 턴은 받자마자 끝나 등록부에 오르지 않으므로 중단할 수 없다.

use super::access::{TURN_ALREADY_FINISHED, require, require_turn, session_conflict};
use super::active::ActiveTurns;
use super::live::key;
use super::parts::FlowParts;
use crate::shared::ApiError;
use crate::support::Requester;
use crate::support::response::CancelledTurnResponse;
use crate::support::session::TurnStatus;

pub async fn cancel(
    parts: &FlowParts,
    turns: &ActiveTurns,
    requester: &Requester,
    session_id: &str,
    turn_id: &str,
) -> Result<CancelledTurnResponse, ApiError> {
    require(parts.sessions.as_ref(), session_id, requester).await?;
    let key = key(session_id, turn_id);
    // 구독한 뒤에 당기면 줄은 `Cancelled` 를 받고, 흐름이 저장을 마쳐 항목이 빠지면 끝난다. 밀려 끊겼으면 다시 붙는다.
    while let Some((_, mut events)) = turns.subscribe(&key) {
        turns.cancel(&key);
        while events.recv().await.is_some() {}
    }
    let mut session = require(parts.sessions.as_ref(), session_id, requester).await?;
    match require_turn(&session, turn_id)?.status {
        TurnStatus::Cancelled => {}
        TurnStatus::Done | TurnStatus::Failed => {
            return Err(ApiError::Conflict(TURN_ALREADY_FINISHED.to_owned()));
        }
        // 저장소에는 도는데 등록부에 없다(이 프로세스가 돌리는 턴이 아니다): 답 없이 여기서 닫는다.
        TurnStatus::Pending | TurnStatus::Streaming => {
            session
                .cancel_turn(turn_id, None, parts.clock.now())
                .map_err(|error| session_conflict(session_id, error))?;
            parts.sessions.save(&session.snapshot()).await?;
        }
    }
    Ok(CancelledTurnResponse::of(turn_id))
}
