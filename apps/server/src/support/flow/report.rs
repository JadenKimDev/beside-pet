//! 마음 리포트 작성(ADR-0008): 닫혔고 과제 2 이상일 때만 열리고, 처음 요청 때 한 번 써서 저장하며 다음부터는 저장된 것을 낸다.
//!
//! 구조(도달 과제, 언어, 장의 순서)는 규칙이 정하고 네 장의 본문만 모델이 쓴다. 사용자 턴이 모자라면 모델 없이 절을 비운다.

use super::access::session_conflict;
use super::parts::FlowParts;
use crate::llm::{CallContext, CallPurpose, GenerationRequest, PromptMessage, PromptRole};
use crate::shared::ApiError;
use crate::support::prompt::{
    REPORT_PROMPT_VERSION, ReportContext, parse_report_bodies, report_system_prompt,
    report_user_prompt,
};
use crate::support::rules::{MindReport, REPORT_SECTION_ORDER};
use crate::support::session::{Session, SessionError};
use crate::support::{
    MessageRole, MindReportResponse, MindReportSectionResponse, ReportSectionKey,
};

/// 리포트 한 번의 출력 상한(TS 의 `REPORT_MAX_TOKENS`).
pub const REPORT_MAX_TOKENS: u32 = 900;

/// 사용자 턴이 이보다 적은 전사는 쓸 이야기가 없어, 모델을 부르지 않고 절 없는 리포트를 저장한다(#32).
pub const REPORT_MIN_USER_TURNS: usize = 2;

pub async fn report(
    parts: &FlowParts,
    mut session: Session,
) -> Result<MindReportResponse, ApiError> {
    if !session.report_available() {
        return Err(session_conflict(
            session.id(),
            SessionError::ReportUnavailable,
        ));
    }
    if let Some(stored) = session.report() {
        return Ok(stored.to_response(session.started_at()));
    }
    let report = write(parts, &session).await?;
    let response = report.to_response(session.started_at());
    session
        .attach_report(report)
        .map_err(|error| session_conflict(session.id(), error))?;
    parts.sessions.save(&session.snapshot()).await?;
    Ok(response)
}

async fn write(parts: &FlowParts, session: &Session) -> Result<MindReport, ApiError> {
    let profile = session.grief_profile();
    let sections = if user_turns(session) < REPORT_MIN_USER_TURNS {
        Vec::new()
    } else {
        write_sections(parts, session).await?
    };
    Ok(MindReport {
        at: parts.clock.now(),
        pet_name: profile.display_pet_name().to_owned(),
        reached_task: session.task(),
        locale: profile.language(),
        sections,
    })
}

fn user_turns(session: &Session) -> usize {
    session
        .history()
        .iter()
        .filter(|message| message.role == MessageRole::User)
        .count()
}

/// 네 장의 본문을 모델에게 받아 정해진 순서로 놓는다.
async fn write_sections(
    parts: &FlowParts,
    session: &Session,
) -> Result<Vec<MindReportSectionResponse>, ApiError> {
    let context = ReportContext {
        profile: session.grief_profile(),
        reached_task: session.task(),
        crisis: session.support_level().is_crisis(),
        history: session.history(),
    };
    let raw = parts
        .model
        .generate(GenerationRequest {
            system: Some(report_system_prompt(&context)),
            messages: vec![PromptMessage {
                role: PromptRole::User,
                text: report_user_prompt(&context),
            }],
            max_tokens: REPORT_MAX_TOKENS,
            context: CallContext {
                purpose: CallPurpose::Report,
                prompt_version: REPORT_PROMPT_VERSION,
                session_id: Some(session.id().to_owned()),
            },
        })
        .await?;
    let bodies = parse_report_bodies(&raw);
    Ok(REPORT_SECTION_ORDER
        .iter()
        .map(|&key| MindReportSectionResponse {
            key,
            body: bodies.get(key).to_owned(),
            tags: section_tags(key, &bodies.emotion_tags),
        })
        .collect())
}

/// 감정 낱말은 emotions 구역에만 둔다. 모델이 낱말 줄을 쓰지 않았으면 없다.
fn section_tags(key: ReportSectionKey, emotion_tags: &[String]) -> Option<Vec<String>> {
    (key == ReportSectionKey::Emotions && !emotion_tags.is_empty()).then(|| emotion_tags.to_vec())
}
