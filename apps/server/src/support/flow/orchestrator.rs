//! 한 턴의 순서: 안전 확인 → 과제 전이 → 지식 검색 → 발화 → 턴 분석 → 저장(ADR-0005), 그리고 세션의 첫 인사.
//!
//! 구조(과제, 진행률, 지원 수준)는 세션 규칙이 정하고 모델은 글만 쓴다. 위기면 발화 모델을 부르지 않고 `safety` 의
//! 고정 문구로 닫는다(ADR-0004). 동기와 스트림은 답이 나가는 길(`Voice`)만 다르다.

use super::parts::FlowParts;
use super::voice::Voice;
use crate::llm::{CallContext, CallPurpose, GenerationRequest};
use crate::safety::{assess_risk, crisis_reply};
use crate::shared::ApiError;
use crate::support::knowledge::{KNOWLEDGE_LIMIT, KnowledgeChunk};
use crate::support::prompt::{
    PreviousSession, REPLY_PROMPT_VERSION, ReplyContext, reply_messages, reply_system_prompt,
};
use crate::support::rules::SupportLevel;
use crate::support::session::{Message, Session};
use crate::support::{KnowledgeRefResponse, ReplyPhase, SessionSummaryResponse, TurnResponse};

use super::access::session_conflict;

/// 발화 한 번의 출력 상한(TS 의 `MAX_TOKENS`).
pub const REPLY_MAX_TOKENS: u32 = 320;

/// 재개 인사가 잇는 직전 세션: 닫혔을 때의 요약과 전사의 꼬리.
#[derive(Debug, Clone)]
pub struct Previous {
    pub summary: Option<SessionSummaryResponse>,
    pub recent_history: Vec<Message>,
}

/// 첫 인사(온보딩이면 intro, 직전 세션을 이으면 resume). 인사를 적고 저장한다.
pub async fn greet(
    parts: &FlowParts,
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
    voice.announce(&session).await;
    let request = reply_request(&session, phase, &knowledge, previous);
    let reply = voice.compose(parts.model.as_ref(), request).await?;
    session.record_reply(&reply, parts.clock.now());
    parts.sessions.save(&session.snapshot()).await?;
    Ok(session.turn_response(reply))
}

/// 사용자 턴 하나. 세션은 열려 있어야 한다(닫혔으면 409).
pub async fn handle(
    parts: &FlowParts,
    mut session: Session,
    text: &str,
    voice: &Voice<'_>,
) -> Result<TurnResponse, ApiError> {
    // 1) 안전 확인: 키워드 ∪ 모델 판정.
    let level =
        SupportLevel::from(assess_risk(text, Some(session.id()), parts.model.as_ref()).await);
    // 2) 과제 전이(위기면 여기서 닫힌다).
    let step = session
        .apply_user_turn(text, level, parts.clock.now())
        .map_err(|error| session_conflict(session.id(), error))?;
    if step.is_crisis() {
        let reply = crisis_reply();
        voice.announce(&session).await;
        voice.fixed(reply).await;
        let at = parts.clock.now();
        session.record_reply(reply, at);
        session.record_turn(&step, reply, Vec::new(), at);
        parts.sessions.save(&session.snapshot()).await?;
        return Ok(session.turn_response(reply.to_owned()));
    }
    // 3) 지식 검색, 4) 발화.
    let knowledge = parts.knowledge.retrieve(session.task(), KNOWLEDGE_LIMIT);
    voice.announce(&session).await;
    let request = reply_request(&session, step.phase, &knowledge, None);
    let reply = voice.compose(parts.model.as_ref(), request).await?;
    // 5) 턴 분석, 6) 저장. 클로징에 닿은 턴은 답을 적은 뒤 닫는다.
    let at = parts.clock.now();
    session.record_reply(&reply, at);
    if step.closes() {
        session.close();
    }
    session.record_turn(&step, &reply, knowledge_refs(&knowledge), at);
    parts.sessions.save(&session.snapshot()).await?;
    Ok(session.turn_response(reply))
}

fn reply_request(
    session: &Session,
    phase: ReplyPhase,
    knowledge: &[KnowledgeChunk],
    previous: Option<&Previous>,
) -> GenerationRequest {
    let profile = session.grief_profile();
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
