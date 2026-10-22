//! 세션 시작의 두 길: 온보딩의 프로필이 있으면 과제 1 의 새 세션, 없으면 소유자의 직전 세션(마지막 메시지가 가장 늦은 것)에서
//! 프로필을 이어 재개한다. 재개 과제는 직전이 닿은 과제이되, 클로징까지 갔거나 위기로 닫혔거나 7일을 넘었으면 과제 1 이다.
//!
//! 어느 쪽이든 계정의 대화 언어가 프로필보다 앞선다. 세션 id 는 요청이 보낸 것이다.

use super::orchestrator::{Previous, PreviousEnding};
use super::parts::FlowParts;
use crate::shared::ApiError;
use crate::support::rules::Task;
use crate::support::session::Session;
use crate::support::{Requester, StartSessionRequest};

/// 재개 인사에 넘기는 직전 전사의 꼬리 길이(TS 의 `PREVIOUS_HISTORY_TAIL`).
const PREVIOUS_HISTORY_TAIL: usize = 6;
/// 재개가 처음부터 다시 시작하고 인사가 경과를 말하는, 넘어야 하는 날 수.
const RESUME_GAP_DAYS: i64 = 7;
const NO_PRIOR_SESSION: &str = "No prior session to continue; onboarding is required.";

pub struct Started {
    pub session: Session,
    /// 재개일 때만 있다.
    pub previous: Option<Previous>,
}

/// 새 세션을 만든다(저장은 부르는 쪽). 직전 세션 없이 프로필도 없으면 400.
pub async fn create(
    parts: &FlowParts,
    requester: &Requester,
    request: StartSessionRequest,
) -> Result<Started, ApiError> {
    let owner_id = requester.account_id.clone();
    let now = parts.clock.now();
    let mut started = match request.grief_profile {
        Some(profile) => Started {
            session: Session::start(request.session_id, owner_id, profile, now, Task::FIRST),
            previous: None,
        },
        None => {
            let latest = parts
                .sessions
                .latest_by_owner(&requester.account_id)
                .await?
                .ok_or_else(|| ApiError::bad_request(NO_PRIOR_SESSION))?;
            let days_since = (now - latest.last_active_at).num_days().max(0);
            let latest = Session::rehydrate(latest.snapshot);
            let ending = ending(&latest);
            let history = latest.history();
            let tail = &history[history.len().saturating_sub(PREVIOUS_HISTORY_TAIL)..];
            Started {
                session: Session::start(
                    request.session_id,
                    owner_id,
                    latest.grief_profile().clone(),
                    now,
                    resume_task(latest.task(), ending, days_since),
                ),
                previous: Some(Previous {
                    summary: latest.summary(),
                    recent_history: tail.to_vec(),
                    days_since,
                    ending,
                }),
            }
        }
    };
    if let Some(language) = parts.languages.chat_language(&requester.account_id).await? {
        started.session.adopt_language(language);
    }
    Ok(started)
}

/// 직전 세션이 끝난 모양: 닫혔고 지원 수준이 위기면 위기, 닫혔으면 보통, 아니면 열린 채.
fn ending(latest: &Session) -> PreviousEnding {
    match (latest.closed(), latest.support_level().is_crisis()) {
        (true, true) => PreviousEnding::Crisis,
        (true, false) => PreviousEnding::Closed,
        (false, _) => PreviousEnding::Open,
    }
}

/// 직전 세션이 닿은 과제에서 다시 시작한다. 클로징까지 갔거나, 위기로 닫혔거나, 오래됐으면 처음부터(ADR-0005 에 더한 두 조건).
fn resume_task(reached: Task, ending: PreviousEnding, days_since: i64) -> Task {
    if reached.is_closing() || ending == PreviousEnding::Crisis || is_long_gap(days_since) {
        Task::FIRST
    } else {
        reached
    }
}

/// 재개 인사가 경과를 말하고 과제를 처음부터 하는 공백인가.
pub(super) fn is_long_gap(days_since: i64) -> bool {
    days_since > RESUME_GAP_DAYS
}
