//! 발화 한 번의 모델 입력: 시스템 프롬프트와 단계 지침, 히스토리 창(TS 의 `reply.prompt.ts`).
//!
//! 단계와 과제는 규칙이 정해 넘긴다. 여기서는 그것을 글로 바꾸기만 한다. 문구는 TS 그대로다.

use super::language::output_language;
use super::transcript::{speaker_lines, to_prompt_role};
use crate::identity::ChatLanguage;
use crate::llm::{PromptMessage, PromptRole};
use crate::support::knowledge::KnowledgeChunk;
use crate::support::session::Message;
use crate::support::{ReplyPhase, SessionSummaryResponse};

/// 이 프롬프트의 버전(`x.y.z`). 문구를 바꾸는 커밋이 같은 커밋에서 올린다: major 는 실측 기준선을 새로 잡는 변경,
/// minor 는 같은 기준선에서 비교할 수 있는 문구 변경, patch 는 오탈자와 다듬기.
pub const PROMPT_VERSION: &str = "0.1.0";

/// 한 턴에 모델로 보내는 최근 메시지의 수.
pub const HISTORY_WINDOW: usize = 10;

/// 재개 인사가 지난 대화를 이어 가도록 넘기는 것.
#[derive(Debug, Clone, Copy)]
pub struct PreviousSession<'a> {
    pub summary: Option<&'a SessionSummaryResponse>,
    /// 지난 전사의 꼬리. 고르는 것은 부르는 쪽이다.
    pub recent_history: &'a [Message],
}

/// 발화 한 번을 쓰는 데 필요한 것.
#[derive(Debug, Clone, Copy)]
pub struct ReplyContext<'a> {
    pub phase: ReplyPhase,
    pub pet_name: &'a str,
    pub language: ChatLanguage,
    pub knowledge: &'a [KnowledgeChunk],
    pub history: &'a [Message],
    /// 재개 인사일 때만 있다.
    pub previous: Option<PreviousSession<'a>>,
}

pub fn reply_system_prompt(context: &ReplyContext<'_>) -> String {
    let grounding = context
        .knowledge
        .iter()
        .map(|chunk| format!("- ({}) {}", chunk.source, chunk.content))
        .collect::<Vec<_>>()
        .join("\n");
    let lines = [
        "You are a warm companion supporting someone through the grief of losing a beloved pet.".to_owned(),
        format!(
            "The pet's name is \"{}\". Respond ONLY in {}.",
            context.pet_name,
            output_language(context.language)
        ),
        "Speak about one thing at a time, in 2-3 short and gentle sentences. Do not use lists, assessments, or strings of advice.".to_owned(),
        "Keep empathy and acknowledgement to one sentence at most, and every reply except a closing MUST end with exactly one concrete question the user can answer. Never reply with empathy alone.".to_owned(),
        format!("Current phase guidance: {}", phase_guide(context.phase)),
        context.previous.map(previous_session_block).unwrap_or_default(),
        if grounding.is_empty() {
            String::new()
        } else {
            format!("Ground your words in the following verified grief theory, but never quote or cite it:\n{grounding}")
        },
    ];
    join_non_empty(&lines)
}

/// 최근 창의 메시지를 모델 입력으로 바꾼다. 모델이 먼저 말해야 하면(마지막이 사용자가 아니면) 단계 씨앗을 붙여
/// 요청이 늘 사용자 메시지로 끝나게 한다.
pub fn reply_messages(context: &ReplyContext<'_>) -> Vec<PromptMessage> {
    let start = context.history.len().saturating_sub(HISTORY_WINDOW);
    let mut messages: Vec<PromptMessage> = context.history[start..]
        .iter()
        .map(|message| PromptMessage {
            role: to_prompt_role(message.role),
            text: message.text.clone(),
        })
        .collect();
    if messages.last().map(|m| m.role) != Some(PromptRole::User) {
        messages.push(PromptMessage {
            role: PromptRole::User,
            text: phase_seed(context.phase).to_owned(),
        });
    }
    messages
}

/// 지난 대화를 잇는 블록(재개 인사).
fn previous_session_block(previous: PreviousSession<'_>) -> String {
    let recap = previous
        .summary
        .map(|summary| format!("Previous session recap: {}", summary.headline))
        .unwrap_or_default();
    let tail = speaker_lines(previous.recent_history);
    let lines = [
        "Context from the previous conversation (for continuity — never quote it verbatim):"
            .to_owned(),
        recap,
        if tail.is_empty() {
            String::new()
        } else {
            format!("Last messages exchanged:\n{tail}")
        },
        "Gently acknowledge what was shared last time before asking your reopening question."
            .to_owned(),
    ];
    join_non_empty(&lines)
}

fn join_non_empty(lines: &[String]) -> String {
    lines
        .iter()
        .filter(|line| !line.is_empty())
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join("\n")
}

fn phase_guide(phase: ReplyPhase) -> &'static str {
    match phase {
        ReplyPhase::Intro => {
            "Greet briefly, reassure them you are here together, then move straight into one concrete question that opens the story of the loss. Always include a short parenthetical example (e.g., ...) so the user knows what kind of answer fits."
        }
        ReplyPhase::Resume => {
            "Briefly welcome them back, then ask one concrete question that reopens the current stage as a continuation of the previous conversation — do not start over from the beginning. Always include a short parenthetical example (e.g., ...)."
        }
        ReplyPhase::Task => {
            "Move the conversation forward with one question that opens the new stage. Include a short parenthetical example (e.g., ...) to make answering easier."
        }
        ReplyPhase::Deepen => {
            "Pick up what the user just said and ask one follow-up question that goes one layer deeper — do not switch topics. Always include a short parenthetical example (e.g., ...)."
        }
        ReplyPhase::Retry => {
            "Do not press. Reassure them that not answering is fine, then ask one low-pressure question. Include a very easy parenthetical example (even a single word is fine)."
        }
        ReplyPhase::Closing => {
            "Acknowledge what they shared today and close warmly. Do not ask a new question."
        }
    }
}

fn phase_seed(phase: ReplyPhase) -> &'static str {
    match phase {
        ReplyPhase::Intro => "(The session begins.)",
        ReplyPhase::Resume => "(The session resumes from last time.)",
        ReplyPhase::Task => "(Please continue.)",
        ReplyPhase::Deepen => "(Please go a little deeper.)",
        ReplyPhase::Retry => "(Please continue gently.)",
        ReplyPhase::Closing => "(Please close the conversation.)",
    }
}

#[cfg(test)]
mod tests;
