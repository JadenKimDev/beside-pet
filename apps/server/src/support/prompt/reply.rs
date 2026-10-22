//! 발화 한 번의 모델 입력: 시스템 프롬프트와 단계 지침, 이번 턴의 화법 줄, 히스토리 창(TS 의 `reply.prompt.ts`).
//!
//! 단계와 과제는 규칙이 정해 넘긴다. 여기서는 그것을 글로 바꾸기만 한다. 문구는 TS 에서 왔고, 0.2.0 에서 정체·화법
//! 지시문을 다시 썼다(괄호 예시 필수, 안심 지침, 질문 강제를 걷어 냈다). 0.4.0 에서 정체 문장을 한 사람의 결로
//! 바꾸고(이름·직업·나이·자기 반려동물·자기 경험담은 두지 않는다) 긍정형 문체 한 줄과 언어별 대명사 줄을 더했다.
//!
//! 시스템 프롬프트는 이름 붙은 블록의 목록을 이은 것이다. 블록 이름은 sandbox 턴 추적이 그대로 남긴다.

use super::language::output_language;
use super::transcript::{speaker_lines, to_prompt_role};
use crate::identity::ChatLanguage;
use crate::llm::{PromptMessage, PromptRole};
use crate::support::knowledge::KnowledgeChunk;
use crate::support::rules::TurnStyle;
use crate::support::session::Message;
use crate::support::{ReplyPhase, SessionSummaryResponse};

/// 이 프롬프트의 버전(`x.y.z`). 문구를 바꾸는 커밋이 같은 커밋에서 올린다: major 는 실측 기준선을 새로 잡는 변경,
/// minor 는 같은 기준선에서 비교할 수 있는 문구 변경, patch 는 오탈자와 다듬기.
pub const PROMPT_VERSION: &str = "0.4.0";

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
    /// 이번 턴의 화법. 시스템 프롬프트의 마지막 줄이 된다.
    pub turn_style: &'a TurnStyle,
}

/// 정체 문장. 한 사람의 결만 두고 이름, 직업, 나이, 자기 반려동물, 자기 경험담은 두지 않는다(사용자 결정
/// 2026-10-22). 상담·치료가 아니라는 부정형은 ADR-0003 이 허락하는 면책의 자리다.
const IDENTITY: &str = "You are one particular person keeping a grieving pet owner company, not a service and not a script. You are not a counselor or therapist and never act like one. You speak little and plainly, sometimes with a dry, gentle humor. You trust silence and do not fill it. You do not explain people's feelings to them or tell them what their feelings mean; you say what you notice.";

/// 문체는 긍정형 한 줄만 둔다. 금지 목록과 예시는 두지 않는다(ADR-0027).
const STYLE: &str = "Talk the way people speak aloud: vary your sentence endings, and use concrete nouns and plain verbs.";

/// 시스템 프롬프트의 이름 붙은 한 조각. 이름은 `identity`, `pet`, `output_rules`, `phase`, `previous`,
/// `knowledge`, `turn_style` 중 하나다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PromptBlock {
    pub name: &'static str,
    pub text: String,
}

/// 시스템 프롬프트를 정해진 순서의 블록으로 조립한다. 빈 블록은 목록에서 뺀다.
pub fn reply_prompt_blocks(context: &ReplyContext<'_>) -> Vec<PromptBlock> {
    let grounding = context
        .knowledge
        .iter()
        .map(|chunk| format!("- ({}) {}", chunk.source, chunk.content))
        .collect::<Vec<_>>()
        .join("\n");
    let output_rules = [
        "Reply in 1-3 short sentences about one thing at a time. Do not use lists, assessments, or strings of advice.",
        "Build your reply from what the user actually said (the places, things, and habits they mentioned), put in your own words.",
        "Vary how you begin and end each reply.",
        "Ask at most one question, and only when it helps. A reply does not have to end with a question.",
        "Never invent details about the pet that the user has not mentioned (its looks, habits, or moments together).",
        STYLE,
        pronoun_line(context.language),
    ]
    .join("\n");
    let blocks = [
        ("identity", IDENTITY.to_owned()),
        (
            "pet",
            format!(
                "The pet's name is \"{}\". Respond ONLY in {}.",
                context.pet_name,
                output_language(context.language)
            ),
        ),
        ("output_rules", output_rules),
        (
            "phase",
            format!("Current phase guidance: {}", phase_guide(context.phase)),
        ),
        (
            "previous",
            context
                .previous
                .map(previous_session_block)
                .unwrap_or_default(),
        ),
        (
            "knowledge",
            if grounding.is_empty() {
                String::new()
            } else {
                format!(
                    "Ground your words in the following verified grief theory, but never quote or cite it:\n{grounding}"
                )
            },
        ),
        ("turn_style", context.turn_style.instruction()),
    ];
    blocks
        .into_iter()
        .filter(|(_, text)| !text.is_empty())
        .map(|(name, text)| PromptBlock { name, text })
        .collect()
}

pub fn reply_system_prompt(context: &ReplyContext<'_>) -> String {
    reply_prompt_blocks(context)
        .into_iter()
        .map(|block| block.text)
        .collect::<Vec<_>>()
        .join("\n")
}

/// 사용자의 1인칭이 누구인지 알리는 줄. 되받을 때 동반자가 사용자의 "저"를 가져가 화자가 뒤집히는 것을 막는다.
fn pronoun_line(language: ChatLanguage) -> &'static str {
    match language {
        ChatLanguage::Ko => {
            "When the user writes 저/제/나/내, that is the user, not you; when you refer back to them, use a form of address that fits how you two have been talking, or drop the pronoun."
        }
        ChatLanguage::En => {
            "\"I\", \"me\", and \"my\" in the user's message are the user, not you; when you refer back to them, say \"you\"."
        }
    }
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
            "Greet briefly, then ask one question that opens the story of their pet. Since it is the first question, you may add a short example of what kind of answer fits."
        }
        ReplyPhase::Resume => {
            "Briefly welcome them back, then reopen the current stage as a continuation of the previous conversation — do not start over from the beginning."
        }
        ReplyPhase::Task => {
            "Move the conversation forward with one question that opens the new stage."
        }
        ReplyPhase::Deepen => {
            "Pick up what the user just said and go one layer deeper — do not switch topics."
        }
        ReplyPhase::Retry => {
            "Do not press; not answering is fine. If you ask, keep it low-pressure, and you may add a very easy example (even a single word is fine)."
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
