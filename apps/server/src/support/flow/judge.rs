//! 답 판정기의 경계: 생성된 답 하나가 일반 위로인가를 묻는 trait 와 그 입출력 타입(ADR-0031).
//! 구현(Haiku, systemone)은 `llm` 이 하고 `app.rs` 가 `REPLY_JUDGE` 설정으로 끼운다. 판정을 쓰는 흐름은 맡지 않는다.

use std::collections::BTreeMap;
use std::fmt;
use std::sync::Arc;

use futures_util::future::BoxFuture;

mod adapters;

pub use adapters::{HaikuReplyJudge, SystemOneReplyJudge};

/// 답의 라벨. 앞 PRD(#26)의 ADR-0025 와 같은 집합이다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ReplyLabel {
    GenericComfort,
    SpecificReflection,
    Question,
}

impl ReplyLabel {
    pub const ALL: [ReplyLabel; 3] = [
        ReplyLabel::GenericComfort,
        ReplyLabel::SpecificReflection,
        ReplyLabel::Question,
    ];

    /// 저장과 판정기 응답에 쓰는 글(`turn_analyses.reply_label`).
    pub fn as_str(self) -> &'static str {
        match self {
            ReplyLabel::GenericComfort => "generic_comfort",
            ReplyLabel::SpecificReflection => "specific_reflection",
            ReplyLabel::Question => "question",
        }
    }

    /// `as_str` 의 글을 정확히 읽는다(대소문자와 공백을 걷지 않는다). 모르는 글은 `None`.
    pub fn parse(text: &str) -> Option<ReplyLabel> {
        ReplyLabel::ALL
            .into_iter()
            .find(|label| label.as_str() == text)
    }
}

/// 판정 한 번의 입력. 본문이라 `Debug` 에는 길이만 싣는다.
#[derive(Clone, PartialEq, Eq)]
pub struct JudgeInput {
    /// 직전 사용자 말, 오래된 것부터 최대 2개.
    pub recent_user: Vec<String>,
    /// 판정할 답.
    pub reply: String,
    /// 대화 언어(`ko`, `en`).
    pub language: String,
}

impl fmt::Debug for JudgeInput {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("JudgeInput")
            .field("recent_user", &self.recent_user.len())
            .field("reply_chars", &self.reply.chars().count())
            .field("language", &self.language)
            .finish()
    }
}

/// 판정 결과. 확률은 판정기가 준 값 그대로이고 여기서 계산하지 않는다.
#[derive(Debug, Clone, PartialEq)]
pub struct Judgement {
    pub label: ReplyLabel,
    /// 라벨마다의 확률. 확률을 주지 않는 판정기(Haiku)는 `None`.
    pub probabilities: Option<BTreeMap<ReplyLabel, f32>>,
    /// 판정기 이름(`turn_analyses.reply_judge`).
    pub judge: &'static str,
    /// 판정기 프롬프트나 모델의 버전(`x.y.z`).
    pub version: &'static str,
}

impl Judgement {
    /// 판정기가 그 라벨에 준 확률. 없으면 `None`.
    pub fn probability(&self, label: ReplyLabel) -> Option<f32> {
        self.probabilities.as_ref()?.get(&label).copied()
    }

    /// 고른 라벨의 확률(`turn_analyses.reply_label_probability`).
    pub fn label_probability(&self) -> Option<f32> {
        self.probability(self.label)
    }
}

/// 판정하지 못한 이유. 종류만 갖고 본문과 응답 글은 싣지 않는다(로그에 그대로 적어도 된다).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JudgeError {
    /// 시간 제한을 넘겼다.
    Timeout,
    /// 판정기에 닿지 못했거나 오류 상태로 답했다.
    Unavailable,
    /// 응답을 읽지 못했다(모르는 라벨, 모양이 다른 본문).
    BadResponse,
}

impl fmt::Display for JudgeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            JudgeError::Timeout => "reply judge timed out",
            JudgeError::Unavailable => "reply judge unavailable",
            JudgeError::BadResponse => "reply judge returned an unreadable response",
        })
    }
}

impl std::error::Error for JudgeError {}

/// 답 하나를 판정한다. `Ok(None)` 은 판정하지 않았다는 뜻이다(판정기 끔). 실패해도 대화는 이어진다.
pub trait ReplyJudge {
    fn judge(&self, input: JudgeInput) -> BoxFuture<'_, Result<Option<Judgement>, JudgeError>>;
}

pub type SharedReplyJudge = Arc<dyn ReplyJudge + Send + Sync>;

/// 판정기 끔(`REPLY_JUDGE=off`): 늘 판정하지 않는다.
#[derive(Debug, Clone, Copy, Default)]
pub struct Unimplemented;

impl ReplyJudge for Unimplemented {
    fn judge(&self, _input: JudgeInput) -> BoxFuture<'_, Result<Option<Judgement>, JudgeError>> {
        Box::pin(async { Ok(None) })
    }
}

#[cfg(test)]
mod tests;
