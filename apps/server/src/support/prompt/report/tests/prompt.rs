// 리포트 프롬프트: TS 문구 그대로, 위기 안내 한 줄, 사실 블록과 전사. 픽스처는 지어낸 값이다.

use chrono::{TimeZone, Utc};

use super::super::{ReportContext, report_system_prompt, report_user_prompt};
use crate::identity::ChatLanguage;
use crate::support::rules::{GriefProfile, Task};
use crate::support::session::Message;
use crate::support::{GriefPath, LossType, MessageRole, Situation, TogetherRange};

fn profile() -> GriefProfile {
    GriefProfile {
        grief_path: GriefPath::AfterLoss,
        pet_name: Some("보리".to_owned()),
        together_range: Some(TogetherRange::EightToEleven),
        loss_type: Some(LossType::Illness),
        situation: Some(Situation::Aging),
        weeks_since_loss: Some(2.0),
        daily_state: None,
        preferred_language: Some(ChatLanguage::Ko),
    }
}

fn message(role: MessageRole, text: &str) -> Message {
    Message {
        role,
        text: text.to_owned(),
        task: Task::FIRST,
        at: Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap(),
    }
}

fn context<'a>(
    profile: &'a GriefProfile,
    history: &'a [Message],
    crisis: bool,
) -> ReportContext<'a> {
    ReportContext {
        profile,
        reached_task: Task::new(3).unwrap(),
        crisis,
        history,
    }
}

#[test]
fn the_system_prompt_is_the_ts_text() {
    let profile = profile();
    let expected = [
        "You are a warm companion who just walked through a pet-loss grief conversation with the user. You now hand them a \"mind report\" that looks back on the conversation.",
        "The pet's name is \"보리\". Write ONLY in Korean, in a soft and heartfelt tone.",
        "Do not use medical language such as treatment, diagnosis, or prescription. Use only the language of emotional support and companionship.",
        "Write each of the four sections below in 2-3 sentences. Each section MUST start with its marker:",
        "@@journey — Warmly acknowledge the steps of grief walked today as an achievement.",
        "@@emotions — Acknowledge the feelings that surfaced in the conversation, and reassure them that these are natural feelings born of love.",
        "@@keepsake — Pick one memory of 보리 from what the user actually shared, and reflect it back as something to hold on to.",
        "@@encouragement — Close by honoring today and offering one line that helps them be gentle with themselves.",
        "Output only the markers (@@journey etc.) and their bodies — no other headers, lists, or quotation marks.",
    ]
    .join("\n");
    assert_eq!(
        report_system_prompt(&context(&profile, &[], false)),
        expected
    );
}

#[test]
fn a_crisis_session_adds_the_support_line_note() {
    let profile = profile();
    let prompt = report_system_prompt(&context(&profile, &[], true));
    assert!(prompt.contains(
        "gentle with themselves. If their pain feels heavy, gently add that professional support lines (e.g., 109 in Korea, 988 in the US) are always there to lean on.\n"
    ));
}

#[test]
fn a_profile_without_name_or_language_uses_the_defaults() {
    let profile = GriefProfile {
        pet_name: None,
        preferred_language: None,
        ..profile()
    };
    let prompt = report_system_prompt(&context(&profile, &[], false));
    assert!(prompt.contains("The pet's name is \"your little one\". Write ONLY in English,"));
}

#[test]
fn the_user_prompt_lists_the_facts_and_the_transcript() {
    let profile = profile();
    let history = [
        message(MessageRole::Assistant, "어떤 아이였나요?"),
        message(MessageRole::User, "잘 웃는 아이였어요"),
    ];
    let expected = [
        "[Facts]",
        "- Pet: 보리",
        "- Time together: 8-11",
        "- Type of loss/situation: illness",
        "- Stage reached: 3/5 (progress 50%)",
        "",
        "[Transcript]",
        "Companion: 어떤 아이였나요?\nUser: 잘 웃는 아이였어요",
    ]
    .join("\n");
    assert_eq!(
        report_user_prompt(&context(&profile, &history, false)),
        expected
    );
}

#[test]
fn missing_facts_fall_back_like_ts() {
    let situation_only = GriefProfile {
        together_range: None,
        loss_type: None,
        situation: Some(Situation::EndOfLife),
        ..profile()
    };
    let prompt = report_user_prompt(&context(&situation_only, &[], false));
    assert!(prompt.contains("- Time together: unknown\n"));
    assert!(prompt.contains("- Type of loss/situation: endOfLife\n"));
    assert!(prompt.ends_with("[Transcript]\n"));

    let nothing = GriefProfile {
        loss_type: None,
        situation: None,
        ..profile()
    };
    assert!(
        report_user_prompt(&context(&nothing, &[], false))
            .contains("- Type of loss/situation: unknown\n")
    );
}
