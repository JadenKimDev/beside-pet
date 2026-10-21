//! 다시 붙는 스트림: 턴이 등록부에 있으면 지금까지 모은 글과 이어지는 조각을, 끝난 턴이면 답 전체를 같은 이벤트 모양으로 낸다(ADR-0030).
//!
//! 실패했거나 중단된 턴은 409 "Turn is not active" 다. 등록부는 이 프로세스의 메모리뿐이라 다른 상태는 저장소의 턴이 정한다.

use super::access::{TURN_NOT_ACTIVE, require, require_turn};
use super::active::{ActiveTurns, TurnEvent};
use super::live::key;
use super::orchestrator::Finished;
use super::outside::SessionRepository;
use super::stream::Emitter;
use crate::shared::ApiError;
use crate::support::session::{Session, TurnStatus};
use crate::support::{Requester, StreamEvent};

/// 세션 `session_id` 의 턴 `turn_id` 에 붙어 끝까지 이벤트를 보낸다. 마지막 이벤트(`done`, `cancelled`)는 돌려준 값이 정한다.
pub async fn reattach(
    sessions: &(dyn SessionRepository + Send + Sync),
    turns: &ActiveTurns,
    requester: &Requester,
    session_id: &str,
    turn_id: &str,
    out: &Emitter,
) -> Result<Finished, ApiError> {
    let session = require(sessions, session_id, requester).await?;
    let Some((gathered, mut events)) = turns.subscribe(&key(session_id, turn_id)) else {
        // 등록부에 없다: 저장소의 턴이 끝났으면 답 전체를 보낸다.
        let turn = require_turn(&session, turn_id)?;
        if turn.status != TurnStatus::Done {
            return Err(ApiError::Conflict(TURN_NOT_ACTIVE.to_owned()));
        }
        return finished(&session, turn_id, out, true).await;
    };
    out.send(session.meta_event()).await;
    out.send(StreamEvent::Token { text: gathered }).await;
    loop {
        match events.recv().await {
            Some(TurnEvent::Chunk(text)) => out.send(StreamEvent::Token { text }).await,
            Some(TurnEvent::Cancelled) => return Ok(Finished::Cancelled),
            // 끝났거나(`Done`), 받지 못하고 밀려 끊겼다(`None`): 저장소에서 결과를 읽는다.
            Some(TurnEvent::Done) | None => break,
        }
    }
    let session = require(sessions, session_id, requester).await?;
    match require_turn(&session, turn_id)?.status {
        TurnStatus::Done => finished(&session, turn_id, out, false).await,
        TurnStatus::Cancelled => Ok(Finished::Cancelled),
        // 실패했거나 아직 저장이 따라오지 못했다: `done` 없이 끊는다(웹은 "답 다시 받기"를 둔다).
        _ => Err(ApiError::Internal),
    }
}

/// 끝난 턴의 결과. `whole` 이면 `meta` 와 답 전체 `token` 을 먼저 보낸다.
async fn finished(
    session: &Session,
    turn_id: &str,
    out: &Emitter,
    whole: bool,
) -> Result<Finished, ApiError> {
    let reply = session.turn_reply(turn_id).unwrap_or_default().to_owned();
    if whole {
        out.send(session.meta_event()).await;
        out.send(StreamEvent::Token {
            text: reply.clone(),
        })
        .await;
    }
    Ok(Finished::Done(session.turn_response(reply)))
}
