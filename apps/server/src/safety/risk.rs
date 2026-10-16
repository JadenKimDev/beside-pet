//! 사용자 메시지 하나의 위기 판정: 키워드와 모델 판정의 합집합, 모델이 실패하면 키워드 결과로 대신한다(ADR-0004).
//!
//! 키워드가 걸리면 모델에 묻지 않는다. 모델은 `TextModel` 로 받는다(어떤 모델인지는 부르는 쪽이 정한다).
//! 로그에 사용자 글과 모델의 답을 싣지 않는다.

use super::matches_crisis;
use crate::llm::{GenerationRequest, PromptMessage, PromptRole, TextModel};

/// TS 의 `risk.prompt.ts` 를 그대로 옮겼다(문장들을 `' '` 로 이은 것과 같다). 감지만 하고 위기 답은 고정 문구다.
pub const RISK_SYSTEM_PROMPT: &str = "You are a safety classifier for a pet-loss grief support chat. \
Decide whether the user's message expresses genuine suicidal intent, a wish to die/disappear, or intent to self-harm — in ANY language. \
Grief idioms or hyperbole about missing the pet (e.g. \"I miss them so much I could die\") are NOT risk. \
If there is a genuine, non-idiomatic sign of self-harm or suicidal intent, or you are truly unsure about self-harm, answer YES. \
Reply with exactly one word: YES or NO.";

/// 한 단어(YES/NO)만 받으면 된다(TS 와 같은 값).
const RISK_MAX_TOKENS: u32 = 5;

/// 판정 결과.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskLevel {
    Safe,
    Crisis,
}

/// 메시지 하나가 위기인가. 키워드와 모델 중 하나라도 위기면 위기다(안전은 오탐 쪽으로 기운다).
pub async fn assess_risk(text: &str, model: &(dyn TextModel + Send + Sync)) -> RiskLevel {
    let keyword = matches_crisis(text);
    if keyword {
        return RiskLevel::Crisis;
    }
    let request = GenerationRequest {
        system: Some(RISK_SYSTEM_PROMPT.to_owned()),
        messages: vec![PromptMessage {
            role: PromptRole::User,
            text: text.to_owned(),
        }],
        max_tokens: RISK_MAX_TOKENS,
    };
    let flagged = match model.generate(request).await {
        // TS 와 같이 다듬어 대문자로 본 답이 YES 로 시작하면 위기다.
        Ok(answer) => answer.trim().to_uppercase().starts_with("YES"),
        Err(error) => {
            tracing::warn!(
                ?error,
                "model risk check failed — falling back to the keyword screen"
            );
            keyword
        }
    };
    if flagged {
        RiskLevel::Crisis
    } else {
        RiskLevel::Safe
    }
}

#[cfg(test)]
mod tests;
