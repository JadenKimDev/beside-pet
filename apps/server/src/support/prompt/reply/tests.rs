// 발화 프롬프트: 시스템 프롬프트(TS 문구 그대로), 단계 지침, 히스토리 창과 단계 씨앗. 픽스처는 지어낸 대화다.

use chrono::{TimeZone, Utc};

use super::{HISTORY_WINDOW, PreviousSession, ReplyContext, reply_messages, reply_system_prompt};
use crate::identity::ChatLanguage;
use crate::llm::{PromptMessage, PromptRole};
use crate::support::knowledge::KnowledgeChunk;
use crate::support::rules::Task;
use crate::support::session::Message;
use crate::support::{MessageRole, ReplyPhase, SessionSummaryResponse};

const ALL_PHASES: [ReplyPhase; 6] = [
    ReplyPhase::Intro,
    ReplyPhase::Resume,
    ReplyPhase::Task,
    ReplyPhase::Deepen,
    ReplyPhase::Retry,
    ReplyPhase::Closing,
];

fn message(role: MessageRole, text: &str) -> Message {
    Message {
        role,
        text: text.to_owned(),
        task: Task::FIRST,
        at: Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap(),
    }
}

fn context<'a>(
    phase: ReplyPhase,
    history: &'a [Message],
    knowledge: &'a [KnowledgeChunk],
) -> ReplyContext<'a> {
    ReplyContext {
        phase,
        pet_name: "보리",
        language: ChatLanguage::Ko,
        knowledge,
        history,
        previous: None,
    }
}

fn chunk(source: &str, content: &str) -> KnowledgeChunk {
    KnowledgeChunk {
        source: source.to_owned(),
        content: content.to_owned(),
        tags: Vec::new(),
    }
}

#[test]
fn the_system_prompt_is_the_ts_text_with_grounding() {
    let knowledge = [chunk("출처A", "내용A"), chunk("출처B", "내용B")];
    let prompt = reply_system_prompt(&context(ReplyPhase::Deepen, &[], &knowledge));
    let expected = [
        "You are a warm companion supporting someone through the grief of losing a beloved pet.",
        "The pet's name is \"보리\". Respond ONLY in Korean.",
        "Speak about one thing at a time, in 2-3 short and gentle sentences. Do not use lists, assessments, or strings of advice.",
        "Keep empathy and acknowledgement to one sentence at most, and every reply except a closing MUST end with exactly one concrete question the user can answer. Never reply with empathy alone.",
        "Current phase guidance: Pick up what the user just said and ask one follow-up question that goes one layer deeper — do not switch topics. Always include a short parenthetical example (e.g., ...).",
        "Ground your words in the following verified grief theory, but never quote or cite it:\n- (출처A) 내용A\n- (출처B) 내용B",
    ]
    .join("\n");
    assert_eq!(prompt, expected);
}

#[test]
fn without_knowledge_or_previous_the_prompt_has_five_lines_in_english() {
    let mut ctx = context(ReplyPhase::Closing, &[], &[]);
    ctx.language = ChatLanguage::En;
    let prompt = reply_system_prompt(&ctx);
    let lines: Vec<&str> = prompt.lines().collect();
    assert_eq!(lines.len(), 5);
    assert_eq!(
        lines[1],
        "The pet's name is \"보리\". Respond ONLY in English."
    );
    assert_eq!(
        lines[4],
        "Current phase guidance: Acknowledge what they shared today and close warmly. Do not ask a new question."
    );
}

#[test]
fn every_phase_has_its_own_guidance() {
    let guides: Vec<String> = ALL_PHASES
        .iter()
        .map(|&phase| {
            let prompt = reply_system_prompt(&context(phase, &[], &[]));
            prompt.lines().nth(4).unwrap().to_owned()
        })
        .collect();
    assert!(guides[0].contains("Greet briefly, reassure them you are here together"));
    assert!(guides[1].contains("Briefly welcome them back"));
    assert!(
        guides[2]
            .contains("Move the conversation forward with one question that opens the new stage.")
    );
    assert!(guides[3].contains("goes one layer deeper"));
    assert!(guides[4].contains("Do not press. Reassure them that not answering is fine"));
    assert!(guides[4].contains("(even a single word is fine)"));
    assert!(guides[5].contains("close warmly"));
}

#[test]
fn a_resume_carries_the_previous_session_before_the_grounding() {
    let previous_history = [
        message(MessageRole::User, "산책이 그리워요"),
        message(MessageRole::Assistant, "그 길이 생각나시는군요"),
    ];
    let summary = SessionSummaryResponse {
        at: Utc.with_ymd_and_hms(2026, 1, 1, 0, 0, 0).unwrap(),
        reached_task: 2,
        turn_count: 6,
        highest_support_level: 1,
        headline: "지난번에 산책을 이야기했다".to_owned(),
        follow_up: "다음에 이어서".to_owned(),
    };
    let knowledge = [chunk("출처A", "내용A")];
    let mut ctx = context(ReplyPhase::Resume, &[], &knowledge);
    ctx.previous = Some(PreviousSession {
        summary: Some(&summary),
        recent_history: &previous_history,
    });
    let prompt = reply_system_prompt(&ctx);
    let block = [
        "Context from the previous conversation (for continuity — never quote it verbatim):",
        "Previous session recap: 지난번에 산책을 이야기했다",
        "Last messages exchanged:\nUser: 산책이 그리워요\nCompanion: 그 길이 생각나시는군요",
        "Gently acknowledge what was shared last time before asking your reopening question.",
    ]
    .join("\n");
    let grounding = "Ground your words in the following verified grief theory, but never quote or cite it:\n- (출처A) 내용A";
    assert!(
        prompt.contains(&format!("\n{block}\n{grounding}")),
        "{prompt}"
    );
}

#[test]
fn a_previous_session_without_summary_or_tail_keeps_only_the_frame() {
    let mut ctx = context(ReplyPhase::Resume, &[], &[]);
    ctx.previous = Some(PreviousSession {
        summary: None,
        recent_history: &[],
    });
    let prompt = reply_system_prompt(&ctx);
    assert!(prompt.ends_with(
        "Context from the previous conversation (for continuity — never quote it verbatim):\nGently acknowledge what was shared last time before asking your reopening question."
    ));
}

#[test]
fn the_history_window_is_ten_messages() {
    assert_eq!(HISTORY_WINDOW, 10);
    let history: Vec<Message> = (0..13)
        .map(|i| {
            let role = if i % 2 == 0 {
                MessageRole::User
            } else {
                MessageRole::Assistant
            };
            message(role, &format!("m{i}"))
        })
        .collect();
    let messages = reply_messages(&context(ReplyPhase::Deepen, &history, &[]));
    let texts: Vec<&str> = messages.iter().map(|m| m.text.as_str()).collect();
    assert_eq!(
        texts,
        [
            "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12"
        ]
    );
    assert_eq!(messages[0].role, PromptRole::Assistant);
    assert_eq!(messages[9].role, PromptRole::User);
}

#[test]
fn a_trailing_user_message_gets_no_seed() {
    let history = [
        message(MessageRole::Assistant, "안녕하세요"),
        message(MessageRole::User, "보리가 보고 싶어요"),
    ];
    assert_eq!(
        reply_messages(&context(ReplyPhase::Deepen, &history, &[])),
        [
            PromptMessage {
                role: PromptRole::Assistant,
                text: "안녕하세요".to_owned()
            },
            PromptMessage {
                role: PromptRole::User,
                text: "보리가 보고 싶어요".to_owned()
            },
        ]
    );
}

#[test]
fn when_the_model_speaks_first_a_phase_seed_ends_the_request() {
    let seeds = [
        "(The session begins.)",
        "(The session resumes from last time.)",
        "(Please continue.)",
        "(Please go a little deeper.)",
        "(Please continue gently.)",
        "(Please close the conversation.)",
    ];
    for (phase, seed) in ALL_PHASES.into_iter().zip(seeds) {
        assert_eq!(
            reply_messages(&context(phase, &[], &[])),
            [PromptMessage {
                role: PromptRole::User,
                text: seed.to_owned()
            }],
            "{phase:?}"
        );
    }
    let history = [
        message(MessageRole::User, "네"),
        message(MessageRole::Assistant, "고마워요"),
    ];
    let messages = reply_messages(&context(ReplyPhase::Task, &history, &[]));
    assert_eq!(messages.len(), 3);
    assert_eq!(
        messages[2],
        PromptMessage {
            role: PromptRole::User,
            text: "(Please continue.)".to_owned()
        }
    );
}
