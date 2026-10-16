//! 세션 시작의 두 길: 온보딩의 프로필이 있으면 과제 1 의 새 세션, 없으면 소유자의 최근 세션에서 프로필을 이어 그 과제에서 재개한다.
//!
//! 어느 쪽이든 계정의 대화 언어가 프로필보다 앞선다. 세션 id 는 요청이 보낸 것이다.

use super::orchestrator::Previous;
use super::parts::FlowParts;
use crate::shared::ApiError;
use crate::support::rules::Task;
use crate::support::session::Session;
use crate::support::{Requester, StartSessionRequest};

/// 재개 인사에 넘기는 직전 전사의 꼬리 길이(TS 의 `PREVIOUS_HISTORY_TAIL`).
const PREVIOUS_HISTORY_TAIL: usize = 6;
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
                .find_by_owner(&requester.account_id, 1)
                .await?
                .into_iter()
                .next()
                .map(Session::rehydrate)
                .ok_or_else(|| ApiError::bad_request(NO_PRIOR_SESSION))?;
            let history = latest.history();
            let tail = &history[history.len().saturating_sub(PREVIOUS_HISTORY_TAIL)..];
            Started {
                session: Session::start(
                    request.session_id,
                    owner_id,
                    latest.grief_profile().clone(),
                    now,
                    resume_task(latest.task()),
                ),
                previous: Some(Previous {
                    summary: latest.summary(),
                    recent_history: tail.to_vec(),
                }),
            }
        }
    };
    if let Some(language) = parts.languages.chat_language(&requester.account_id).await? {
        started.session.adopt_language(language);
    }
    Ok(started)
}

/// 직전 세션이 닿은 과제에서 다시 시작한다. 클로징까지 갔으면 처음부터.
fn resume_task(reached: Task) -> Task {
    if reached.is_closing() {
        Task::FIRST
    } else {
        reached
    }
}
