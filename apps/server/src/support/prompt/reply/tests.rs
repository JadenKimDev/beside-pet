// 발화 프롬프트: 시스템 프롬프트(정체·화법 지시문), 단계 지침, 히스토리 창과 단계 씨앗. 픽스처는 지어낸 대화다.

use chrono::{TimeZone, Utc};

use super::{
    HISTORY_WINDOW, PROMPT_VERSION, PreviousSession, ReplyContext, reply_messages,
    reply_system_prompt,
};
use crate::identity::ChatLanguage;
use crate::llm::{PromptMessage, PromptRole};
use crate::support::knowledge::KnowledgeChunk;
use crate::support::rules::{QuestionPolicy, Task, TurnStyle};
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
        turn_id: None,
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
        turn_style: style(phase),
    }
}

/// 빈 기록에서 구한 이번 턴의 화법. 맥락이 참조로 받으므로 테스트에서는 놓아 둔다.
fn style(phase: ReplyPhase) -> &'static TurnStyle {
    Box::leak(Box::new(TurnStyle::from_history(phase, &[], &[])))
}

fn last_line(prompt: &str) -> &str {
    prompt.lines().last().expect("a non-empty prompt")
}

fn chunk(source: &str, content: &str) -> KnowledgeChunk {
    KnowledgeChunk {
        source: source.to_owned(),
        content: content.to_owned(),
        tags: Vec::new(),
    }
}

const IDENTITY: &str = "You are someone a grieving pet owner is talking with. Speak like a thoughtful person, not like a script.";
const NO_INVENTING: &str = "Never invent details about the pet that the user has not mentioned (its looks, habits, or moments together).";

fn phase_guidance(prompt: &str) -> &str {
    prompt
        .lines()
        .find_map(|line| line.strip_prefix("Current phase guidance: "))
        .expect("phase guidance line")
}

#[test]
fn the_prompt_version_is_0_2_0() {
    assert_eq!(PROMPT_VERSION, "0.2.0");
}

#[test]
fn the_system_prompt_is_the_identity_and_style_text_with_grounding() {
    let knowledge = [chunk("출처A", "내용A"), chunk("출처B", "내용B")];
    let prompt = reply_system_prompt(&context(ReplyPhase::Deepen, &[], &knowledge));
    let expected = [
        IDENTITY,
        "The pet's name is \"보리\". Respond ONLY in Korean.",
        "Reply in 1-3 short sentences about one thing at a time. Do not use lists, assessments, or strings of advice.",
        "Build your reply from what the user actually said (the places, things, and habits they mentioned), put in your own words.",
        "Vary how you begin and end each reply.",
        "Ask at most one question, and only when it helps. A reply does not have to end with a question.",
        NO_INVENTING,
        "Current phase guidance: Pick up what the user just said and go one layer deeper — do not switch topics.",
        "Ground your words in the following verified grief theory, but never quote or cite it:\n- (출처A) 내용A\n- (출처B) 내용B",
        "For this reply: Refer to what they said in your own words; do not open by repeating their sentence.",
    ]
    .join("\n");
    assert_eq!(prompt, expected);
}

#[test]
fn every_phase_ends_with_this_turns_style_line() {
    let knowledge = [chunk("출처A", "내용A")];
    for phase in ALL_PHASES {
        let ctx = context(phase, &[], &knowledge);
        let prompt = reply_system_prompt(&ctx);
        assert_eq!(
            last_line(&prompt),
            ctx.turn_style.instruction(),
            "{phase:?}"
        );
        assert!(
            last_line(&prompt).starts_with("For this reply:"),
            "{phase:?}"
        );
    }
}

#[test]
fn a_forbidding_style_puts_the_no_question_line_last() {
    let forbid = TurnStyle::from_history(
        ReplyPhase::Deepen,
        &["그 길이 생각나시는군요. 어떤 길이었나요?"],
        &["질문 그만 해요"],
    );
    assert_eq!(forbid.question, QuestionPolicy::Forbid);
    let mut ctx = context(ReplyPhase::Deepen, &[], &[]);
    ctx.turn_style = &forbid;
    let prompt = reply_system_prompt(&ctx);
    let line = last_line(&prompt);
    assert!(line.starts_with("For this reply:"), "{line}");
    assert!(line.contains("Do not ask any question"), "{line}");
}

#[test]
fn an_intro_style_invites_one_gentle_question() {
    let prompt = reply_system_prompt(&context(ReplyPhase::Intro, &[], &[]));
    let line = last_line(&prompt);
    assert!(
        line.contains("Open the story of the pet with one gentle question."),
        "{line}"
    );
    assert!(!line.contains("Do not ask"), "{line}");
}

#[test]
fn every_phase_carries_the_identity_and_the_no_inventing_rule() {
    for phase in ALL_PHASES {
        let prompt = reply_system_prompt(&context(phase, &[], &[]));
        assert!(prompt.starts_with(IDENTITY), "{phase:?}");
        assert!(prompt.contains(NO_INVENTING), "{phase:?}");
        assert!(!prompt.contains("warm companion"), "{phase:?}");
    }
}

#[test]
fn no_phase_forces_a_question_or_stock_reassurance() {
    for phase in ALL_PHASES {
        let prompt = reply_system_prompt(&context(phase, &[], &[]));
        assert!(
            !prompt.contains("MUST end with exactly one concrete question"),
            "{phase:?}"
        );
        assert!(
            !prompt.contains("Never reply with empathy alone"),
            "{phase:?}"
        );
        assert!(
            !prompt.contains("reassure them you are here together"),
            "{phase:?}"
        );
    }
}

#[test]
fn no_phase_requires_a_parenthetical_example() {
    for phase in ALL_PHASES {
        let prompt = reply_system_prompt(&context(phase, &[], &[]));
        assert!(!prompt.contains("parenthetical"), "{phase:?}");
        assert!(!prompt.contains("(e.g., ...)"), "{phase:?}");
        for sentence in prompt.split(['.', '\n']) {
            if sentence.contains("example") {
                let lower = sentence.to_lowercase();
                assert!(
                    !lower.contains("always") && !lower.contains("must"),
                    "{phase:?}: {sentence}"
                );
                assert!(lower.contains("may"), "{phase:?}: {sentence}");
            }
        }
    }
}

#[test]
fn only_intro_and_retry_may_add_a_short_example() {
    for phase in ALL_PHASES {
        let guide = phase_guidance(&reply_system_prompt(&context(phase, &[], &[]))).to_owned();
        let allows = matches!(phase, ReplyPhase::Intro | ReplyPhase::Retry);
        assert_eq!(guide.contains("example"), allows, "{phase:?}: {guide}");
    }
}

#[test]
fn without_knowledge_or_previous_the_phase_guidance_comes_just_before_the_style_line_in_english() {
    let mut ctx = context(ReplyPhase::Closing, &[], &[]);
    ctx.language = ChatLanguage::En;
    let prompt = reply_system_prompt(&ctx);
    let lines: Vec<&str> = prompt.lines().collect();
    assert_eq!(lines.len(), 9);
    assert_eq!(
        lines[1],
        "The pet's name is \"보리\". Respond ONLY in English."
    );
    assert_eq!(
        lines[7],
        "Current phase guidance: Acknowledge what they shared today and close warmly. Do not ask a new question."
    );
    assert_eq!(lines[8], ctx.turn_style.instruction());
}

#[test]
fn every_phase_has_its_own_guidance() {
    let guides: Vec<String> = ALL_PHASES
        .iter()
        .map(|&phase| phase_guidance(&reply_system_prompt(&context(phase, &[], &[]))).to_owned())
        .collect();
    assert!(guides[0].starts_with("Greet briefly, then ask one question that opens"));
    assert!(guides[1].contains("Briefly welcome them back"));
    assert!(guides[1].contains("do not start over from the beginning"));
    assert!(
        guides[2]
            .contains("Move the conversation forward with one question that opens the new stage.")
    );
    assert!(guides[3].contains("go one layer deeper — do not switch topics"));
    assert!(guides[4].starts_with("Do not press"));
    assert!(guides[4].contains("not answering is fine"));
    assert!(guides[5].contains("close warmly. Do not ask a new question."));
    let distinct: std::collections::HashSet<&String> = guides.iter().collect();
    assert_eq!(distinct.len(), ALL_PHASES.len());
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
    let expected = format!(
        "Context from the previous conversation (for continuity — never quote it verbatim):\nGently acknowledge what was shared last time before asking your reopening question.\n{}",
        ctx.turn_style.instruction()
    );
    assert!(prompt.ends_with(&expected), "{prompt}");
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
