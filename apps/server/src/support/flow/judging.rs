//! 답의 판정을 턴에 쓰는 법(ADR-0031): 판정기 설정, 판정 한 번(실패는 본문 없는 로그 한 줄과 판정 없음), 동기 턴의 후보 고르기,
//! 스트림 턴이 끝난 뒤의 늦은 기록. 판정기 구현은 `judge`(trait)와 `llm` 이, 판정을 부르는 자리는 오케스트레이터가 맡는다.

use std::sync::Arc;

use futures_util::future::join_all;

use super::judge::{
    JudgeInput, Judgement, ReplyJudge, ReplyLabel, SharedReplyJudge, Unimplemented,
};
use super::orchestrator::language_code;
use super::outside::SharedSessionRepository;
use crate::support::MessageRole;
use crate::support::session::Session;

/// 판정기가 받는 최근 사용자 말의 수.
const RECENT_USER: usize = 2;

/// 판정기와 그 쓰임새. 판정기 끔이면 판정도 후보도 없다.
pub struct Judging {
    pub judge: SharedReplyJudge,
    /// 동기 턴의 후보 수(`REPLY_CANDIDATES`, 1..=3). 1 이면 후보를 고르지 않는다.
    pub candidates: u8,
    /// 직전 답을 일반 위로로 보는 확률의 하한(`REPLY_JUDGE_THRESHOLD`).
    pub threshold: f32,
}

impl Judging {
    /// 판정기 끔, 후보 하나, 기본 임계값.
    pub fn off() -> Judging {
        Judging {
            judge: Arc::new(Unimplemented),
            candidates: 1,
            threshold: 0.5,
        }
    }
}

/// 판정 한 번의 입력: 보이는 사용자 말의 마지막 둘(이번 턴의 말 포함), 답, 대화 언어.
pub fn judge_input(session: &Session, reply: &str) -> JudgeInput {
    let users: Vec<&str> = session
        .visible_messages()
        .filter(|message| message.role == MessageRole::User)
        .map(|message| message.text.as_str())
        .collect();
    JudgeInput {
        recent_user: users[users.len().saturating_sub(RECENT_USER)..]
            .iter()
            .map(|text| (*text).to_owned())
            .collect(),
        reply: reply.to_owned(),
        language: language_code(session.grief_profile().language()).to_owned(),
    }
}

/// 판정 한 번. 실패는 종류만 로그에 남기고 `None` 이다(대화는 이어진다).
pub async fn judge_once(
    judge: &(dyn ReplyJudge + Send + Sync),
    input: JudgeInput,
) -> Option<Judgement> {
    match judge.judge(input).await {
        Ok(judgement) => judgement,
        Err(error) => {
            tracing::warn!(%error, "reply judgement failed; the turn keeps no judgement");
            None
        }
    }
}

/// 동기 턴의 후보를 모두 판정해 하나를 고른다. 후보는 하나 이상이다.
pub async fn choose(
    judge: &(dyn ReplyJudge + Send + Sync),
    session: &Session,
    replies: Vec<String>,
) -> (String, Option<Judgement>) {
    let judgements = join_all(
        replies
            .iter()
            .map(|reply| judge_once(judge, judge_input(session, reply))),
    )
    .await;
    let index = pick(&judgements);
    let reply = replies.into_iter().nth(index).unwrap_or_default();
    (reply, judgements.into_iter().nth(index).flatten())
}

/// 고르는 규칙: 일반 위로의 확률이 있는 후보 중 가장 낮은 것(같으면 앞의 것). 확률이 없으면 라벨이 일반 위로가 아닌
/// 첫 후보, 그것도 없으면(모두 일반 위로이거나 판정이 없으면) 첫 후보.
fn pick(judgements: &[Option<Judgement>]) -> usize {
    let generic = |index: usize| {
        judgements[index]
            .as_ref()
            .and_then(|judgement| judgement.probability(ReplyLabel::GenericComfort))
    };
    let lowest = (0..judgements.len())
        .filter_map(|index| generic(index).map(|probability| (index, probability)))
        .fold(
            None,
            |best: Option<(usize, f32)>, (index, probability)| match best {
                Some((_, low)) if low <= probability => best,
                _ => Some((index, probability)),
            },
        );
    if let Some((index, _)) = lowest {
        return index;
    }
    judgements
        .iter()
        .position(|judgement| {
            judgement
                .as_ref()
                .is_some_and(|judgement| judgement.label != ReplyLabel::GenericComfort)
        })
        .unwrap_or(0)
}

/// 스트림 턴이 끝난(`done` 을 보낸) 뒤의 판정과 기록. 세션을 다시 읽어, 그 사이에 다음 턴이 오지 않았을 때만 적고 저장한다
/// (옛 스냅샷을 저장하면 다음 턴의 메시지를 덮는다). 다음 턴이 왔으면 판정을 버린다.
pub async fn record_after_stream(
    sessions: SharedSessionRepository,
    judge: SharedReplyJudge,
    session_id: String,
    turn_id: String,
    input: JudgeInput,
) {
    let Some(judgement) = judge_once(judge.as_ref(), input).await else {
        return;
    };
    let mut session = match sessions.find(&session_id).await {
        Ok(Some(snapshot)) => Session::rehydrate(snapshot),
        _ => {
            tracing::warn!("could not read the session back to keep the reply judgement");
            return;
        }
    };
    if !session.is_latest_turn(&turn_id) {
        tracing::info!("a newer turn arrived before the reply judgement; it is not kept");
        return;
    }
    if session.record_reply_judgement(&turn_id, judgement).is_err() {
        return;
    }
    if sessions.save(&session.snapshot()).await.is_err() {
        tracing::warn!("could not save the reply judgement");
    }
}
