//! 한 턴의 순서: 안전 확인 → 받기와 저장 → `meta` → 지식 검색 → 발화 → 끝내기(전이, 턴 분석)와 저장(ADR-0005, ADR-0028), 그리고 세션의 첫 인사.
//!
//! 구조(과제, 진행률, 지원 수준)는 세션 규칙이 정하고 모델은 글만 쓴다. 사용자 메시지는 답보다 먼저 `pending` 턴으로 저장하고,
//! 답이 실패하면 턴을 `failed` 로 닫아 저장한다(사용자 메시지는 남고 상태는 그대로다). 위기면 발화 모델을 부르지 않고 `safety` 의
//! 고정 문구로 받자마자 닫는다(ADR-0004). 동기와 스트림은 답이 나가는 길(`Voice`)만 다르다.

use uuid::Uuid;

use super::access::session_conflict;
use super::deadline::{CallFailure, Deadlined};
use super::parts::FlowParts;
use super::voice::Voice;
use crate::llm::{CallContext, CallPurpose, GenerationRequest};
use crate::safety::{assess_risk, crisis_reply};
use crate::shared::ApiError;
use crate::support::knowledge::{KNOWLEDGE_LIMIT, KnowledgeChunk};
use crate::support::prompt::{
    PreviousSession, REPLY_PROMPT_VERSION, ReplyContext, reply_messages, reply_system_prompt,
};
use crate::support::rules::{SupportLevel, TurnStyle};
use crate::support::session::{Message, Session, TurnStep};
use crate::support::{
    KnowledgeRefResponse, MessageRole, ReplyPhase, SessionSummaryResponse, StreamEvent,
    TurnResponse,
};

/// 발화 한 번의 출력 상한(TS 의 `MAX_TOKENS`).
pub const REPLY_MAX_TOKENS: u32 = 320;

/// 재개 인사가 잇는 직전 세션: 닫혔을 때의 요약과 전사의 꼬리.
#[derive(Debug, Clone)]
pub struct Previous {
    pub summary: Option<SessionSummaryResponse>,
    pub recent_history: Vec<Message>,
}

/// 서버가 만드는 턴 id(UUID v4). 첫 인사와 `turnId` 없이 온 사용자 턴에 쓴다.
pub fn new_turn_id() -> String {
    Uuid::new_v4().to_string()
}

/// 첫 인사(온보딩이면 intro, 직전 세션을 이으면 resume). 사용자 메시지 없는 턴 하나로 적고 저장한다.
/// 인사가 실패하면 받은 사용자 말이 없으므로 턴을 남기지 않는다.
pub async fn greet(
    parts: &FlowParts,
    replies: &Deadlined,
    mut session: Session,
    previous: Option<&Previous>,
    voice: &Voice<'_>,
) -> Result<TurnResponse, ApiError> {
    let phase = if previous.is_some() {
        ReplyPhase::Resume
    } else {
        ReplyPhase::Intro
    };
    let knowledge = parts.knowledge.retrieve(session.task(), KNOWLEDGE_LIMIT);
    voice.announce(session.meta_event()).await;
    let request = reply_request(&session, phase, &knowledge, previous);
    let reply = voice
        .compose(replies, request)
        .await
        .map_err(CallFailure::into_error)?;
    session
        .greet(new_turn_id(), &reply, parts.clock.now())
        .map_err(|error| session_conflict(session.id(), error))?;
    parts.sessions.save(&session.snapshot()).await?;
    Ok(session.turn_response(reply))
}

/// 사용자 턴 하나. 세션은 열려 있어야 하고(닫혔으면 409) `turn_id` 는 이 세션에 처음이어야 한다(아니면 409).
pub async fn handle(
    parts: &FlowParts,
    replies: &Deadlined,
    mut session: Session,
    turn_id: String,
    text: &str,
    voice: &Voice<'_>,
) -> Result<TurnResponse, ApiError> {
    let conflict = |session: &Session, error| session_conflict(session.id(), error);
    // 1) 안전 확인: 키워드 ∪ 모델 판정.
    let level =
        SupportLevel::from(assess_risk(text, Some(session.id()), parts.model.as_ref()).await);
    // 위기는 받자마자 닫고 고정 문구로 끝낸다(저장 한 번).
    if level.is_crisis() {
        let reply = crisis_reply();
        session
            .accept_crisis_turn(turn_id, text, reply, parts.clock.now())
            .map_err(|error| conflict(&session, error))?;
        parts.sessions.save(&session.snapshot()).await?;
        voice.announce(session.meta_event()).await;
        voice.fixed(reply).await;
        return Ok(session.turn_response(reply.to_owned()));
    }
    // 2) 받기와 저장: 메시지와 `pending` 턴. 세션 상태는 아직 그대로다.
    session
        .accept_user_turn(turn_id.clone(), text, parts.clock.now())
        .map_err(|error| conflict(&session, error))?;
    parts.sessions.save(&session.snapshot()).await?;
    // 3) 과제 전이(계산만)와 `meta`: 저장한 뒤에 이번 턴이 끝나면 될 구조를 알린다.
    let step = session
        .transition(&turn_id, level)
        .map_err(|error| conflict(&session, error))?;
    voice.announce(meta_for(&session, &step)).await;
    // 4) 지식 검색, 5) 발화.
    let knowledge = parts.knowledge.retrieve(step.to, KNOWLEDGE_LIMIT);
    let request = reply_request(&session, step.phase, &knowledge, None);
    let reply = match voice.compose(replies, request).await {
        Ok(reply) => reply,
        Err(failure) => {
            // 답이 실패해도 사용자 메시지는 남는다. 턴만 `failed` 로 닫는다.
            session
                .fail_turn(&turn_id, failure.kind(), parts.clock.now())
                .map_err(|error| conflict(&session, error))?;
            parts.sessions.save(&session.snapshot()).await?;
            return Err(failure.into_error());
        }
    };
    // 6) 끝내기(전이 적용, 답, 턴 분석, 클로징이면 닫기)와 저장.
    session
        .complete_turn(
            &turn_id,
            level,
            &reply,
            knowledge_refs(&knowledge),
            parts.clock.now(),
        )
        .map_err(|error| conflict(&session, error))?;
    parts.sessions.save(&session.snapshot()).await?;
    Ok(session.turn_response(reply))
}

/// 위기가 아닌 턴의 `meta`: 이번 턴이 끝나면 될 과제·진행률·지원 수준. 클로징도 답 뒤에 닫으므로 `done` 은 거짓이다.
fn meta_for(session: &Session, step: &TurnStep) -> StreamEvent {
    StreamEvent::Meta {
        task: step.to.number(),
        progress: step.to.progress(),
        support_level: session.support_level().raised(step.level).number(),
        done: false,
    }
}

fn reply_request(
    session: &Session,
    phase: ReplyPhase,
    knowledge: &[KnowledgeChunk],
    previous: Option<&Previous>,
) -> GenerationRequest {
    let profile = session.grief_profile();
    let turn_style = turn_style(phase, session.history());
    let context = ReplyContext {
        phase,
        pet_name: profile.display_pet_name(),
        language: profile.language(),
        knowledge,
        history: session.history(),
        previous: previous.map(|previous| PreviousSession {
            summary: previous.summary.as_ref(),
            recent_history: &previous.recent_history,
        }),
        turn_style: &turn_style,
    };
    GenerationRequest {
        system: Some(reply_system_prompt(&context)),
        messages: reply_messages(&context),
        max_tokens: REPLY_MAX_TOKENS,
        context: CallContext {
            purpose: CallPurpose::Reply,
            prompt_version: REPLY_PROMPT_VERSION,
            session_id: Some(session.id().to_owned()),
        },
    }
}

/// 이 세션의 기록(재개 인사의 직전 세션은 넣지 않는다)을 동반자 답과 사용자 말로 갈라 이번 턴의 화법을 정한다.
fn turn_style(phase: ReplyPhase, history: &[Message]) -> TurnStyle {
    let said_by = |role: MessageRole| -> Vec<&str> {
        history
            .iter()
            .filter(|message| message.role == role)
            .map(|message| message.text.as_str())
            .collect()
    };
    TurnStyle::from_history(
        phase,
        &said_by(MessageRole::Assistant),
        &said_by(MessageRole::User),
    )
}

/// 턴 분석에 남기는 지식의 출처와 꼬리표(본문은 남기지 않는다).
fn knowledge_refs(knowledge: &[KnowledgeChunk]) -> Vec<KnowledgeRefResponse> {
    knowledge
        .iter()
        .map(|chunk| KnowledgeRefResponse {
            source: chunk.source.clone(),
            tags: chunk.tags.clone(),
        })
        .collect()
}
