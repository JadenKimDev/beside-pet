//! `llm` 의 판정기 구현을 `ReplyJudge` 에 잇는 어댑터: 입력을 `llm` 의 요청으로, 결과를 `Judgement`·`JudgeError` 로 옮긴다.
//! 판정 자체(HTTP, 프롬프트)는 `llm` 이 한다. 어느 판정기를 끼울지는 `app.rs` 가 정한다.

use std::collections::BTreeMap;

use futures_util::future::BoxFuture;

use super::{JudgeError, JudgeInput, Judgement, ReplyJudge, ReplyLabel};
use crate::llm::{
    HaikuJudge, JUDGE_PROMPT_VERSION, JudgeFailure, JudgeOutcome, JudgeRequest, SystemOneJudge,
};

/// `REPLY_JUDGE=systemone` 의 판정기.
pub struct SystemOneReplyJudge(pub SystemOneJudge);

/// `REPLY_JUDGE=haiku` 의 판정기.
pub struct HaikuReplyJudge(pub HaikuJudge);

impl ReplyJudge for SystemOneReplyJudge {
    fn judge(&self, input: JudgeInput) -> BoxFuture<'_, Result<Option<Judgement>, JudgeError>> {
        Box::pin(async move {
            let outcome = self.0.judge(request_of(input)).await.map_err(error_of)?;
            judgement_of(outcome, SystemOneJudge::NAME).map(Some)
        })
    }
}

impl ReplyJudge for HaikuReplyJudge {
    fn judge(&self, input: JudgeInput) -> BoxFuture<'_, Result<Option<Judgement>, JudgeError>> {
        Box::pin(async move {
            let outcome = self.0.judge(request_of(input)).await.map_err(error_of)?;
            judgement_of(outcome, HaikuJudge::NAME).map(Some)
        })
    }
}

/// 판정기의 질문은 언어를 묻지 않는다(평가 하네스와 같은 한국어 질문). 언어는 싣지 않는다.
fn request_of(input: JudgeInput) -> JudgeRequest {
    JudgeRequest {
        user_turns: input.recent_user,
        reply: input.reply,
    }
}

/// 판정기의 답을 `Judgement` 로. 라벨이나 확률의 라벨을 모르면 `BadResponse`.
fn judgement_of(outcome: JudgeOutcome, judge: &'static str) -> Result<Judgement, JudgeError> {
    let label = ReplyLabel::parse(outcome.label).ok_or(JudgeError::BadResponse)?;
    let probabilities = match outcome.probabilities {
        None => None,
        Some(given) => Some(
            given
                .into_iter()
                .map(|(key, value)| ReplyLabel::parse(key).map(|known| (known, value)))
                .collect::<Option<BTreeMap<_, _>>>()
                .ok_or(JudgeError::BadResponse)?,
        ),
    };
    Ok(Judgement {
        label,
        probabilities,
        judge,
        version: JUDGE_PROMPT_VERSION,
    })
}

fn error_of(failure: JudgeFailure) -> JudgeError {
    match failure {
        JudgeFailure::Timeout => JudgeError::Timeout,
        JudgeFailure::Unavailable => JudgeError::Unavailable,
        JudgeFailure::BadResponse => JudgeError::BadResponse,
    }
}

#[cfg(test)]
mod tests;
