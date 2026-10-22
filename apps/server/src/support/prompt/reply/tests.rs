// 발화 프롬프트: 시스템 프롬프트(정체·화법 지시문), 단계 지침, 히스토리 창과 단계 씨앗. 픽스처는 지어낸 대화다.

use chrono::{TimeZone, Utc};

use super::{
    HISTORY_WINDOW, PROMPT_VERSION, PreviousSession, ReplyContext, reply_messages,
    reply_prompt_blocks, reply_system_prompt,
};
use crate::identity::ChatLanguage;
use crate::llm::{PromptMessage, PromptRole};
use crate::support::knowledge::KnowledgeChunk;
use crate::support::rules::{QuestionPolicy, Task, TurnStyle};
use crate::support::session::Message;
use crate::support::{
    MemoryNote, MemoryView, MessageRole, NoteKind, Pet, PetStatus, ReplyPhase,
    SessionSummaryResponse,
};

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
        memory: None,
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

const IDENTITY: &str = "You are one particular person keeping a grieving pet owner company, not a service and not a script. You are not a counselor or therapist and never act like one. You speak little and plainly, sometimes with a dry, gentle humor. You trust silence and do not fill it. You do not explain people's feelings to them or tell them what their feelings mean; you say what you notice.";
/// 정체 문장 안의 면책 부정형. ADR-0003 이 허락하는 유일한 금지어 자리다.
const NOT_A_COUNSELOR: &str = "You are not a counselor or therapist and never act like one.";
const STYLE: &str = "Talk the way people speak aloud: vary your sentence endings, and use concrete nouns and plain verbs.";
const PRONOUN_KO: &str = "When the user writes 저/제/나/내, that is the user, not you; when you refer back to them, use a form of address that fits how you two have been talking, or drop the pronoun.";
const PRONOUN_EN: &str = "\"I\", \"me\", and \"my\" in the user's message are the user, not you; when you refer back to them, say \"you\".";
const NO_BRINGING_UP: &str =
    "Do not bring up on your own how the pet died or anything about their guilt.";
const NO_INVENTING: &str = "Never invent details about the pet that the user has not mentioned (its looks, habits, or moments together).";

fn phase_guidance(prompt: &str) -> &str {
    prompt
        .lines()
        .find_map(|line| line.strip_prefix("Current phase guidance: "))
        .expect("phase guidance line")
}

#[test]
fn the_prompt_version_is_0_5_0() {
    assert_eq!(PROMPT_VERSION, "0.5.0");
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
        STYLE,
        PRONOUN_KO,
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
    // "질문 그만 해요" 는 15자 이하라 짧은 말 줄이 질문 금지 줄의 자리를 대신한다(#37 S3).
    assert!(line.contains("ask no question"), "{line}");
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
    assert_eq!(lines.len(), 11);
    assert_eq!(
        lines[1],
        "The pet's name is \"보리\". Respond ONLY in English."
    );
    assert_eq!(lines[7], STYLE);
    assert_eq!(lines[8], PRONOUN_EN);
    assert_eq!(
        lines[9],
        "Current phase guidance: Acknowledge what they shared today and close warmly. Do not ask a new question."
    );
    assert_eq!(lines[10], ctx.turn_style.instruction());
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
        days_since: 1,
        long_gap: false,
        ended_in_crisis: false,
    });
    let prompt = reply_system_prompt(&ctx);
    let block = [
        "Context from the previous conversation (for continuity — never quote it verbatim):",
        "Previous session recap: 지난번에 산책을 이야기했다",
        "Last messages exchanged:\nUser: 산책이 그리워요\nCompanion: 그 길이 생각나시는군요",
        "Gently acknowledge what was shared last time before asking your reopening question.",
        NO_BRINGING_UP,
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
        days_since: 1,
        long_gap: false,
        ended_in_crisis: false,
    });
    let prompt = reply_system_prompt(&ctx);
    let expected = format!(
        "Context from the previous conversation (for continuity — never quote it verbatim):\nGently acknowledge what was shared last time before asking your reopening question.\n{NO_BRINGING_UP}\n{}",
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

/// ADR-0003 의 금지어. 영어 지시문은 면책 부정형 한 자리만 허락하고, 한국어 낱말은 어디에도 두지 않는다.
const ADR_0003_WORDS: [&str; 11] = [
    "counsel",
    "therap",
    "treatment",
    "clinical",
    "diagnos",
    "cure",
    "patient",
    "상담",
    "치료",
    "테라피",
    "환자",
];

/// 페르소나의 이름, 직업, 나이, 자기 반려동물, 자기 경험담을 뜻하는 낱말(사용자 결정 2026-10-22).
const PERSONAL_HISTORY_WORDS: [&str; 22] = [
    "my name",
    "your name is",
    "named ",
    "my dog",
    "my cat",
    "my pet",
    "own dog",
    "own cat",
    "own pet",
    "own experience",
    "years old",
    "in her",
    "in his",
    "forties",
    "fifties",
    "woman",
    "I work",
    "I am a",
    "I'm a",
    "runs a",
    "lost her",
    "봄이",
];

fn every_prompt() -> Vec<String> {
    let knowledge = [chunk("출처A", "내용A")];
    let mut prompts = Vec::new();
    for language in [ChatLanguage::Ko, ChatLanguage::En] {
        for phase in ALL_PHASES {
            let mut ctx = context(phase, &[], &knowledge);
            ctx.language = language;
            prompts.push(reply_system_prompt(&ctx));
        }
    }
    prompts
}

#[test]
fn the_identity_is_the_persona_texture_with_the_disclaimer() {
    for prompt in every_prompt() {
        let identity = prompt.lines().next().expect("identity line");
        assert_eq!(identity, IDENTITY);
        assert!(identity.contains(NOT_A_COUNSELOR), "{identity}");
        for texture in [
            "speak little and plainly",
            "dry, gentle humor",
            "trust silence and do not fill it",
            "do not explain people's feelings",
            "say what you notice",
        ] {
            assert!(identity.contains(texture), "{texture}");
        }
    }
}

#[test]
fn no_prompt_carries_an_adr_0003_word_outside_the_disclaimer() {
    for prompt in every_prompt() {
        let rest = prompt.replacen(NOT_A_COUNSELOR, "", 1).to_lowercase();
        for word in ADR_0003_WORDS {
            assert!(!rest.contains(word), "{word}: {prompt}");
        }
    }
}

#[test]
fn no_prompt_gives_the_companion_a_name_job_age_or_pet_of_its_own() {
    for prompt in every_prompt() {
        let lower = prompt.to_lowercase();
        for word in PERSONAL_HISTORY_WORDS {
            assert!(!lower.contains(&word.to_lowercase()), "{word}: {prompt}");
        }
    }
}

#[test]
fn a_korean_session_says_whose_first_person_it_is() {
    let prompt = reply_system_prompt(&context(ReplyPhase::Deepen, &[], &[]));
    assert!(prompt.lines().any(|line| line == PRONOUN_KO), "{prompt}");
    assert!(!prompt.contains(PRONOUN_EN), "{prompt}");
}

#[test]
fn an_english_session_says_whose_first_person_it_is() {
    let mut ctx = context(ReplyPhase::Deepen, &[], &[]);
    ctx.language = ChatLanguage::En;
    let prompt = reply_system_prompt(&ctx);
    assert!(prompt.lines().any(|line| line == PRONOUN_EN), "{prompt}");
    assert!(!prompt.contains(PRONOUN_KO), "{prompt}");
}

#[test]
fn the_style_is_one_positive_line_without_examples() {
    for prompt in every_prompt() {
        assert_eq!(prompt.lines().filter(|line| *line == STYLE).count(), 1);
        for word in ["BAD", "GOOD", "e.g."] {
            assert!(!prompt.contains(word), "{word}: {prompt}");
        }
    }
}

#[test]
fn the_blocks_come_in_their_fixed_order_and_join_into_the_prompt() {
    let previous_history = [message(MessageRole::User, "산책이 그리워요")];
    let knowledge = [chunk("출처A", "내용A")];
    let mut ctx = context(ReplyPhase::Resume, &[], &knowledge);
    ctx.previous = Some(PreviousSession {
        summary: None,
        recent_history: &previous_history,
        days_since: 1,
        long_gap: false,
        ended_in_crisis: false,
    });
    let blocks = reply_prompt_blocks(&ctx);
    let names: Vec<&str> = blocks.iter().map(|block| block.name).collect();
    assert_eq!(
        names,
        [
            "identity",
            "pet",
            "output_rules",
            "phase",
            "previous",
            "knowledge",
            "turn_style"
        ]
    );
    let joined = blocks
        .iter()
        .map(|block| block.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    assert_eq!(joined, reply_system_prompt(&ctx));
    assert_eq!(blocks[0].text, IDENTITY);
    assert_eq!(blocks[6].text, ctx.turn_style.instruction());
    assert!(blocks.iter().all(|block| !block.text.is_empty()));
}

#[test]
fn empty_blocks_are_left_out_of_the_list() {
    let blocks = reply_prompt_blocks(&context(ReplyPhase::Deepen, &[], &[]));
    let names: Vec<&str> = blocks.iter().map(|block| block.name).collect();
    assert_eq!(
        names,
        ["identity", "pet", "output_rules", "phase", "turn_style"]
    );
}

/// 재개 블록만 꺼낸다. 오래됐는가는 흐름이 정하는 것이라 여기서는 7일 기준을 흉내 낸다.
fn previous_block(days_since: i64, ended_in_crisis: bool) -> String {
    let mut ctx = context(ReplyPhase::Resume, &[], &[]);
    ctx.previous = Some(PreviousSession {
        summary: None,
        recent_history: &[],
        days_since,
        long_gap: days_since > 7,
        ended_in_crisis,
    });
    reply_prompt_blocks(&ctx)
        .into_iter()
        .find(|block| block.name == "previous")
        .expect("a resume carries the previous block")
        .text
}

#[test]
fn a_resume_within_seven_days_says_nothing_about_the_gap() {
    for days in [0, 3, 7] {
        let block = previous_block(days, false);
        assert!(!block.contains("It has been"), "{days}: {block}");
        assert!(!block.contains("crisis"), "{days}: {block}");
        assert!(block.contains(NO_BRINGING_UP), "{block}");
    }
}

#[test]
fn a_resume_after_more_than_seven_days_carries_the_servers_day_count() {
    let block = previous_block(10, false);
    assert!(
        block.contains("It has been about 10 days since your last conversation; welcome them back in one short line and do not evaluate the gap."),
        "{block}"
    );
    assert!(!block.contains("crisis"), "{block}");
    assert!(block.contains(NO_BRINGING_UP), "{block}");
}

#[test]
fn a_long_gap_is_said_in_weeks() {
    let block = previous_block(90, false);
    assert!(
        block.contains("It has been about 13 weeks since"),
        "{block}"
    );
}

#[test]
fn a_resume_after_a_crisis_acknowledges_it_once_without_repeating_it() {
    let block = previous_block(3, true);
    assert!(
        block.contains("The last conversation ended with a crisis notice about 3 days ago; acknowledge it in one line, ask once how they are now, do not repeat the crisis content, keep it short."),
        "{block}"
    );
    assert!(
        !block.contains("Gently acknowledge what was shared"),
        "{block}"
    );
    assert!(
        !block.contains("It has been"),
        "the crisis line carries the gap: {block}"
    );
    assert!(block.contains(NO_BRINGING_UP), "{block}");
}

#[test]
fn a_crisis_the_same_day_is_said_as_earlier_today() {
    let block = previous_block(0, true);
    assert!(
        block.contains("ended with a crisis notice earlier today;"),
        "{block}"
    );
}

fn at(day: u32) -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 3, day, 9, 0, 0).unwrap()
}

fn pet(id: &str, name: &str, status: PetStatus) -> Pet {
    Pet {
        id: id.to_owned(),
        name: name.to_owned(),
        status,
        loss_type: None,
        source_session_id: "s-old".to_owned(),
        said_at: at(1),
    }
}

fn note(id: &str, kind: NoteKind, pet_id: Option<&str>, text: &str) -> MemoryNote {
    MemoryNote {
        id: id.to_owned(),
        session_id: "s-old".to_owned(),
        seq: 1,
        kind,
        pet_id: pet_id.map(str::to_owned),
        text: text.to_owned(),
        said_at: at(2),
    }
}

fn remembered() -> MemoryView {
    MemoryView {
        pets: vec![
            pet("p-2", "치즈", PetStatus::Living),
            pet("p-1", "보리", PetStatus::Deceased),
        ],
        notes: vec![note(
            "n-1",
            NoteKind::Object,
            Some("p-1"),
            "현관에 보리 담요를 걸어 두었다",
        )],
    }
}

#[test]
fn every_phase_carries_the_memory_block_after_the_pet_line() {
    let view = remembered();
    for phase in ALL_PHASES {
        let mut ctx = context(phase, &[], &[]);
        ctx.memory = Some(&view);
        let blocks = reply_prompt_blocks(&ctx);
        let names: Vec<&str> = blocks.iter().map(|block| block.name).collect();
        assert_eq!(&names[..3], ["identity", "pet", "memory"], "{phase:?}");
        let memory = &blocks[2].text;
        assert!(memory.starts_with("About this person"), "{memory}");
        assert!(
            memory.contains("현관에 보리 담요를 걸어 두었다"),
            "{memory}"
        );
    }
}

#[test]
fn the_memory_block_puts_this_sessions_pet_first() {
    let view = remembered();
    let mut ctx = context(ReplyPhase::Task, &[], &[]);
    ctx.memory = Some(&view);
    let prompt = reply_system_prompt(&ctx);
    let current = prompt
        .find("Pet in this conversation: 보리 (passed away)")
        .expect("the session's pet is named first");
    let other = prompt
        .find("Other pets: 치즈 (living)")
        .expect("then the others");
    assert!(current < other, "{prompt}");
}

#[test]
fn an_empty_memory_leaves_no_block() {
    let view = MemoryView::default();
    let mut ctx = context(ReplyPhase::Task, &[], &[]);
    ctx.memory = Some(&view);
    let names: Vec<&str> = reply_prompt_blocks(&ctx)
        .iter()
        .map(|block| block.name)
        .collect();
    assert!(!names.contains(&"memory"), "{names:?}");
}
