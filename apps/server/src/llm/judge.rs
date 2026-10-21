//! 답 판정기의 구현: 생성된 답 하나의 라벨을 바깥 판정기(로컬 systemone 서버, 글 모델)에 묻는다(ADR-0031).
//! `support` 의 trait 는 모른다. `support` 쪽 어댑터가 이 구현을 trait 에 잇고, 어느 판정기를 쓸지는 `app.rs` 가 정한다.

mod haiku;
mod question;
mod systemone;

use std::collections::BTreeMap;
use std::fmt;

pub use haiku::HaikuJudge;
pub use question::{JUDGE_LABELS, JUDGE_PROMPT_VERSION};
pub use systemone::SystemOneJudge;

/// 판정 한 번의 입력. 본문이라 `Debug` 에는 길이만 싣는다.
#[derive(Clone, PartialEq, Eq)]
pub struct JudgeRequest {
    /// 직전 사용자 말, 오래된 것부터 최대 2개.
    pub user_turns: Vec<String>,
    /// 판정할 답.
    pub reply: String,
}

impl fmt::Debug for JudgeRequest {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("JudgeRequest")
            .field("user_turns", &self.user_turns.len())
            .field("reply_chars", &self.reply.chars().count())
            .finish()
    }
}

/// 판정기가 준 답. 라벨은 늘 `JUDGE_LABELS` 의 하나이고, 확률은 판정기가 준 그대로다.
#[derive(Debug, Clone, PartialEq)]
pub struct JudgeOutcome {
    pub label: &'static str,
    /// 라벨마다의 확률. 확률을 주지 않는 판정기는 `None`.
    pub probabilities: Option<BTreeMap<&'static str, f32>>,
}

/// 판정하지 못한 이유. 종류만 갖는다.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JudgeFailure {
    /// 시간 제한을 넘겼다.
    Timeout,
    /// 판정기에 닿지 못했거나 오류 상태로 답했다.
    Unavailable,
    /// 응답을 읽지 못했다(모르는 라벨, 모양이 다른 본문, 범위 밖 확률).
    BadResponse,
}

#[cfg(test)]
mod tests;
