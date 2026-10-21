//! 글 모델 판정기: 기존 `TextModel` 로 라벨 하나를 글로 받아 읽는다. 확률은 없다.

use super::question::{JUDGE_LABELS, JUDGE_PROMPT_VERSION, MODEL_SYSTEM_PROMPT, model_prompt};
use super::{JudgeFailure, JudgeOutcome, JudgeRequest};
use crate::llm::{
    CallContext, CallPurpose, GenerationRequest, PromptMessage, PromptRole, SharedTextModel,
};

/// 라벨 하나(가장 긴 `specific_reflection` 도 몇 토큰)면 된다.
const MAX_TOKENS: u32 = 16;

pub struct HaikuJudge {
    model: SharedTextModel,
}

impl HaikuJudge {
    /// `turn_analyses.reply_judge` 에 적는 이름.
    pub const NAME: &'static str = "haiku";

    pub fn new(model: SharedTextModel) -> HaikuJudge {
        HaikuJudge { model }
    }

    pub async fn judge(&self, request: JudgeRequest) -> Result<JudgeOutcome, JudgeFailure> {
        let generation = GenerationRequest {
            system: Some(MODEL_SYSTEM_PROMPT.to_owned()),
            messages: vec![PromptMessage {
                role: PromptRole::User,
                text: model_prompt(&request),
            }],
            max_tokens: MAX_TOKENS,
            context: CallContext {
                purpose: CallPurpose::Judge,
                prompt_version: JUDGE_PROMPT_VERSION,
                session_id: None,
            },
        };
        let text = self
            .model
            .generate(generation)
            .await
            .map_err(|_| JudgeFailure::Unavailable)?;
        let label = parse_choice(&text).ok_or(JudgeFailure::BadResponse)?;
        Ok(JudgeOutcome {
            label,
            probabilities: None,
        })
    }
}

/// 답에서 라벨 하나를 읽는다(`claude.py` 의 `parse_choice`). 정확히 라벨 하나면 그것,
/// 본문에 낱말로 나오는 라벨이 하나뿐이면 그것, 아니면 `None`.
pub(super) fn parse_choice(text: &str) -> Option<&'static str> {
    let cleaned = text
        .trim()
        .trim_matches(|c| "`\"'.。 \n".contains(c))
        .trim();
    if let Some(label) = JUDGE_LABELS.into_iter().find(|label| *label == cleaned) {
        return Some(label);
    }
    let mut found = JUDGE_LABELS
        .into_iter()
        .filter(|label| appears_as_word(text, label));
    match (found.next(), found.next()) {
        (Some(label), None) => Some(label),
        _ => None,
    }
}

/// `label` 이 앞뒤에 `[a-z_]` 가 붙지 않은 낱말로 나오는가(정규식 `(?<![a-z_])label(?![a-z_])`).
fn appears_as_word(text: &str, label: &str) -> bool {
    let joined = |c: char| c.is_ascii_lowercase() || c == '_';
    text.match_indices(label).any(|(start, _)| {
        let before = text[..start].chars().next_back();
        let after = text[start + label.len()..].chars().next();
        !before.is_some_and(joined) && !after.is_some_and(joined)
    })
}
