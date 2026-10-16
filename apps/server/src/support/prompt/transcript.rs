//! 전사를 모델이 읽는 글로 옮기는 법: 말한 쪽의 이름표(`User`/`Companion`)와 모델 역할.

use crate::llm::PromptRole;
use crate::support::MessageRole;
use crate::support::session::Message;

/// `User: …` / `Companion: …` 줄을 잇는다. 발화의 지난 대화 블록과 리포트의 전사가 같이 쓴다.
pub fn speaker_lines(history: &[Message]) -> String {
    history
        .iter()
        .map(|message| {
            let speaker = match message.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Companion",
            };
            format!("{speaker}: {}", message.text)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn to_prompt_role(role: MessageRole) -> PromptRole {
    match role {
        MessageRole::User => PromptRole::User,
        MessageRole::Assistant => PromptRole::Assistant,
    }
}
