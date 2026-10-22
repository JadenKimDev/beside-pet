//! 한 턴의 순서: 안전 확인 → 받기와 저장 → `meta` → 지식 검색과 기억 읽기 → 발화 → 끝내기(전이, 턴 분석)와 저장(ADR-0005, ADR-0028), 그리고 세션의 첫 인사.
//!
//! 구조(과제, 진행률, 지원 수준)는 세션 규칙이 정하고 모델은 글만 쓴다. 사용자 메시지는 답보다 먼저 `pending` 턴으로 저장하고,
//! 답이 실패하면 턴을 `failed` 로 닫아 저장한다(사용자 메시지는 남고 상태는 그대로다). 위기면 발화 모델을 부르지 않고 `safety` 의
//! 고정 문구로 받자마자 닫는다(ADR-0004). 동기와 스트림은 답이 나가는 길(`Voice`)만 다르다.
//! 위기가 아닌 사용자 턴은 받은 때부터 끝날 때까지 진행 중 턴 등록부에 있고, 답이 시작하면 `streaming` 을 저장하며, 도중에 중단되면
//! 거기까지 온 답과 함께 `cancelled` 로 닫는다(ADR-0030). 실패한 턴의 답 다시 받기도 같은 길을 밟는다.
//! 끝난 답은 판정기가 잰다(ADR-0031): 동기 턴은 저장 전에(후보가 둘 이상이면 판정으로 하나를 고르고), 스트림 턴은 `done` 을
//! 보낸 뒤에. 위기 턴, 첫 인사, 중단·실패한 턴은 판정하지 않는다.

use uuid::Uuid;

use super::access::{TURN_ALREADY_RECEIVED, TURN_NOT_FAILED, session_conflict};
use super::active::ActiveTurns;
use super::judge::Judgement;
use super::judging::{choose, judge_input, judge_once, record_after_stream};
use super::live::LiveTurn;
use super::parts::FlowParts;
use super::start::is_long_gap;
use super::voice::{Composed, Voice, compose_candidates, failed_turn_kind};
use crate::identity::ChatLanguage;
use crate::llm::{CallContext, CallPurpose, GenerationRequest};
use crate::safety::{assess_risk_verdict, crisis_reply};
use crate::shared::ApiError;
use crate::support::MemoryView;
use crate::support::knowledge::{KNOWLEDGE_LIMIT, KnowledgeChunk};
use crate::support::prompt::{
    PreviousSession, PromptBlock, REPLY_PROMPT_VERSION, ReplyContext, reply_messages,
    reply_prompt_blocks, reply_system_prompt,
};
use crate::support::response::{TraceBlock, TurnTrace};
use crate::support::rules::{RiskAssessment, TurnStyle};
use crate::support::session::{Message, Session, TurnStep};
use crate::support::{
    KnowledgeRefResponse, MessageRole, ReplyPhase, SessionSummaryResponse, StreamEvent,
    TurnResponse,
};

/// 발화 한 번의 출력 상한(TS 의 `MAX_TOKENS`).
pub const REPLY_MAX_TOKENS: u32 = 320;

/// 재개 인사가 잇는 직전 세션: 닫혔을 때의 요약, 전사의 꼬리, 마지막 메시지부터 지난 날 수, 끝난 모양.
#[derive(Debug, Clone)]
pub struct Previous {
    pub summary: Option<SessionSummaryResponse>,
    pub recent_history: Vec<Message>,
    /// 직전 세션의 마지막 메시지(없으면 시작)부터 지금까지 지난 날 수(내림).
    pub days_since: i64,
    pub ending: PreviousEnding,
}

/// 직전 세션이 끝난 모양.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PreviousEnding {
    /// 위기로 닫혔다(닫힘 ∧ 지원 수준 3).
    Crisis,
    /// 보통으로 닫혔다.
    Closed,
    /// 열린 채다.
    Open,
}

/// 사용자 턴이 끝난 모양: 답이 끝났거나, 도중에 중단됐다.
#[derive(Debug, Clone, PartialEq)]
pub enum Finished {
    Done(TurnResponse),
    Cancelled,
}

/// 서버가 만드는 턴 id(UUID v4). 첫 인사와 `turnId` 없이 온 사용자 턴에 쓴다.
pub fn new_turn_id() -> String {
    Uuid::new_v4().to_string()
}

/// 첫 인사(온보딩이면 intro, 직전 세션을 이으면 resume). 사용자 메시지 없는 턴 하나로 적고 저장한다.
/// 인사가 실패하면 받은 사용자 말이 없으므로 턴을 남기지 않는다.
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
    voice.announce(session.meta_event()).await;
    // 첫 인사는 턴 분석이 없어 추적을 남길 자리가 없다.
    let memory = remembered(parts, &session).await;
    let (request, _) = reply_request(
        parts,
        &session,
        phase,
        &knowledge,
        previous,
        memory.as_ref(),
    );
    // 첫 인사는 받은 사용자 말이 없어 중단 대상이 아니다(등록부에 오르지 않는다).
    let Composed::Reply(reply) = voice.compose(parts.model.as_ref(), request, None).await? else {
        // 등록부에 없는 턴은 중단될 수 없다.
        return Err(ApiError::Internal);
    };
    session
        .greet(new_turn_id(), &reply, parts.clock.now())
        .map_err(|error| session_conflict(session.id(), error))?;
    parts.sessions.save(&session.snapshot()).await?;
    Ok(session.turn_response(reply))
}

/// 사용자 턴 하나. 세션은 열려 있어야 하고(닫혔으면 409) `turn_id` 는 이 세션에 처음이어야 한다(아니면 409).
/// 같은 턴 id 가 이 프로세스에서 아직 돌고 있으면(동시에 두 번 왔다) 둘째는 저장 전에 409 다.
pub async fn handle(
    parts: &FlowParts,
    turns: &ActiveTurns,
    mut session: Session,
    turn_id: String,
    text: &str,
    voice: &Voice<'_>,
) -> Result<Finished, ApiError> {
    let conflict = |session: &Session, error| session_conflict(session.id(), error);
    // 1) 안전 확인: 키워드 ∪ 모델 판정. 누가 잡았는지도 턴 분석까지 싣는다.
    let risk = RiskAssessment::from(
        assess_risk_verdict(text, Some(session.id()), parts.model.as_ref()).await,
    );
    // 위기는 받자마자 닫고 고정 문구로 끝낸다(저장 한 번).
    if risk.level.is_crisis() {
        let reply = crisis_reply(language_code(session.grief_profile().language()));
        session
            .accept_crisis_turn(turn_id, text, reply, risk.detected_by, parts.clock.now())
            .map_err(|error| conflict(&session, error))?;
        parts.sessions.save(&session.snapshot()).await?;
        voice.announce(session.meta_event()).await;
        voice.fixed(reply).await;
        return Ok(Finished::Done(session.turn_response(reply.to_owned())));
    }
    // 2) 받기, 등록, 저장: 메시지와 `pending` 턴. 세션 상태는 아직 그대로다. 등록이 저장보다 앞서므로 저장소에 보이는
    //    도는 턴은 늘 등록부에도 있다.
    session
        .accept_user_turn(turn_id.clone(), text, parts.clock.now())
        .map_err(|error| conflict(&session, error))?;
    let live = LiveTurn::register(turns, session.id(), &turn_id)
        .map_err(|_| ApiError::Conflict(TURN_ALREADY_RECEIVED.to_owned()))?;
    parts.sessions.save(&session.snapshot()).await?;
    answer(parts, live, session, &turn_id, risk, voice).await
}

/// 실패한 턴의 답을 다시 받는다: 같은 사용자 메시지로 안전 확인과 전이를 다시 계산하고, 처음 턴과 같은 길(`pending` → `streaming` → `done`)을 밟는다.
/// 사용자 메시지는 다시 적지 않는다. 다시 판정한 결과가 위기면 받은 턴처럼 고정 문구로 닫는다(ADR-0004).
pub async fn retry(
    parts: &FlowParts,
    turns: &ActiveTurns,
    mut session: Session,
    turn_id: &str,
    voice: &Voice<'_>,
) -> Result<Finished, ApiError> {
    let not_failed = || ApiError::Conflict(TURN_NOT_FAILED.to_owned());
    session.retry_turn(turn_id).map_err(|_| not_failed())?;
    let text = session
        .history()
        .iter()
        .rev()
        .find(|message| {
            message.role == MessageRole::User && message.turn_id.as_deref() == Some(turn_id)
        })
        .map(|message| message.text.clone())
        .ok_or_else(not_failed)?;
    let risk = RiskAssessment::from(
        assess_risk_verdict(&text, Some(session.id()), parts.model.as_ref()).await,
    );
    if risk.level.is_crisis() {
        let reply = crisis_reply(language_code(session.grief_profile().language()));
        session
            .complete_turn(turn_id, risk, reply, Vec::new(), parts.clock.now())
            .map_err(|error| session_conflict(session.id(), error))?;
        parts.sessions.save(&session.snapshot()).await?;
        voice.announce(session.meta_event()).await;
        voice.fixed(reply).await;
        return Ok(Finished::Done(session.turn_response(reply.to_owned())));
    }
    let live = LiveTurn::register(turns, session.id(), turn_id).map_err(|_| not_failed())?;
    parts.sessions.save(&session.snapshot()).await?;
    answer(parts, live, session, turn_id, risk, voice).await
}

/// 받아 저장한 `pending` 턴의 답: 전이(계산만)와 `meta` → 지식 검색 → `streaming` 저장 → 발화 → 끝내기와 저장.
/// 발화가 실패하면 `failed`, 중단되면 거기까지 모은 답과 함께 `cancelled` 로 닫아 저장한다. 어느 쪽이든 저장한 뒤에 등록부에서 빠진다.
async fn answer(
    parts: &FlowParts,
    mut live: LiveTurn,
    mut session: Session,
    turn_id: &str,
    risk: RiskAssessment,
    voice: &Voice<'_>,
) -> Result<Finished, ApiError> {
    let conflict = |session: &Session, error| session_conflict(session.id(), error);
    // 3) 과제 전이(계산만)와 `meta`: 저장한 뒤에 이번 턴이 끝나면 될 구조를 알린다.
    let step = session
        .transition(turn_id, risk)
        .map_err(|error| conflict(&session, error))?;
    voice.announce(meta_for(&session, &step)).await;
    // 4) 지식 검색, 5) 발화(시작을 저장한 뒤).
    let knowledge = parts.knowledge.retrieve(step.to, KNOWLEDGE_LIMIT);
    let memory = remembered(parts, &session).await;
    let (request, trace) = reply_request(
        parts,
        &session,
        step.phase,
        &knowledge,
        None,
        memory.as_ref(),
    );
    session
        .start_streaming(turn_id, parts.clock.now())
        .map_err(|error| conflict(&session, error))?;
    parts.sessions.save(&session.snapshot()).await?;
    // 동기 턴은 후보가 둘 이상이면 병렬로 받아 판정으로 하나를 고른다(고른 답의 판정도 함께).
    let candidates = parts.judging.candidates;
    let (composed, chosen) = match voice {
        Voice::Whole if candidates >= 2 => {
            match compose_candidates(parts.model.as_ref(), request, candidates, &mut live).await {
                Ok(Some(replies)) => {
                    let (reply, judgement) =
                        choose(parts.judging.judge.as_ref(), &session, replies).await;
                    (Ok(Composed::Reply(reply)), Some(judgement))
                }
                Ok(None) => (Ok(Composed::Cancelled), None),
                Err(failure) => (Err(failure), None),
            }
        }
        _ => (
            voice
                .compose(parts.model.as_ref(), request, Some(&mut live))
                .await,
            None,
        ),
    };
    let reply = match composed {
        // 답이 끝나는 순간에 온 중단도 중단이다(중단을 부른 쪽은 `cancelled` 를 기다린다).
        Ok(Composed::Reply(reply)) if !live.is_cancelled() => reply,
        Err(failure) if !live.is_cancelled() => {
            // 답이 실패해도 사용자 메시지는 남는다. 턴만 `failed` 로 닫는다.
            session
                .fail_turn(turn_id, failed_turn_kind(&failure), parts.clock.now())
                .map_err(|error| conflict(&session, error))?;
            parts.sessions.save(&session.snapshot()).await?;
            return Err(failure);
        }
        _ => {
            // 중단: 거기까지 온 답을 그 턴의 답으로 적고 숨긴다. 세션 상태는 그대로다.
            session
                .cancel_turn(turn_id, Some(&live.gathered()), parts.clock.now())
                .map_err(|error| conflict(&session, error))?;
            parts.sessions.save(&session.snapshot()).await?;
            return Ok(Finished::Cancelled);
        }
    };
    // 6) 끝내기(전이 적용, 답, 턴 분석, 클로징이면 닫기)와 저장.
    session
        .complete_turn(
            turn_id,
            risk,
            &reply,
            knowledge_refs(&knowledge),
            parts.clock.now(),
        )
        .map_err(|error| conflict(&session, error))?;
    if let Some(trace) = trace {
        session.trace_last_turn(trace);
    }
    match voice {
        Voice::Whole => {
            // 7) 동기 턴은 저장 전에 판정을 적는다(저장은 한 번).
            let judgement = match chosen {
                Some(judgement) => judgement,
                None => {
                    judge_once(parts.judging.judge.as_ref(), judge_input(&session, &reply)).await
                }
            };
            keep_judgement(&mut session, turn_id, judgement);
            parts.sessions.save(&session.snapshot()).await?;
        }
        Voice::Streamed(out) => {
            // 7) 스트림 턴은 저장하고 `done` 을 보낸 뒤에 판정한다(응답 지연에 더하지 않는다).
            parts.sessions.save(&session.snapshot()).await?;
            out.after_last(record_after_stream(
                parts.sessions.clone(),
                parts.judging.judge.clone(),
                session.id().to_owned(),
                turn_id.to_owned(),
                judge_input(&session, &reply),
            ));
        }
    }
    Ok(Finished::Done(session.turn_response(reply)))
}

/// 판정이 있으면 끝난 턴의 분석에 적는다. 적을 수 없는 턴이면(위기 분석) 버린다.
fn keep_judgement(session: &mut Session, turn_id: &str, judgement: Option<Judgement>) {
    if let Some(judgement) = judgement
        && session.record_reply_judgement(turn_id, judgement).is_err()
    {
        tracing::info!("the turn has no reply to judge; the judgement is not kept");
    }
}

/// `safety` 와 판정기가 받는 대화 언어 코드.
pub(super) fn language_code(language: ChatLanguage) -> &'static str {
    match language {
        ChatLanguage::Ko => "ko",
        ChatLanguage::En => "en",
    }
}

/// 위기가 아닌 턴의 `meta`: 이번 턴이 끝나면 될 과제·진행률·지원 수준. 클로징도 답 뒤에 닫으므로 `done` 은 거짓이다.
fn meta_for(session: &Session, step: &TurnStep) -> StreamEvent {
    StreamEvent::Meta {
        task: step.to.number(),
        progress: step.to.progress(),
        support_level: session.support_level().raised(step.risk.level).number(),
        done: false,
    }
}

/// 소유자의 현재 기억. 읽지 못하면 기억 없이 답한다(본문 없이 로그 한 줄).
async fn remembered(parts: &FlowParts, session: &Session) -> Option<MemoryView> {
    match parts.memory.view(session.owner_id()).await {
        Ok(view) => Some(view),
        Err(_) => {
            tracing::warn!("the memory could not be read; the reply goes without it");
            None
        }
    }
}

/// 발화 요청과, 턴 추적을 켰으면(sandbox) 그 요청의 추적.
fn reply_request(
    parts: &FlowParts,
    session: &Session,
    phase: ReplyPhase,
    knowledge: &[KnowledgeChunk],
    previous: Option<&Previous>,
    memory: Option<&MemoryView>,
) -> (GenerationRequest, Option<TurnTrace>) {
    let profile = session.grief_profile();
    let turn_style = turn_style(phase, session.history())
        .after_judgement(session.last_reply_judgement(), parts.judging.threshold);
    let context = ReplyContext {
        phase,
        pet_name: profile.display_pet_name(),
        language: profile.language(),
        knowledge,
        history: session.history(),
        previous: previous.map(|previous| PreviousSession {
            summary: previous.summary.as_ref(),
            recent_history: &previous.recent_history,
            days_since: previous.days_since,
            long_gap: is_long_gap(previous.days_since),
            ended_in_crisis: previous.ending == PreviousEnding::Crisis,
        }),
        memory,
        turn_style: &turn_style,
    };
    let system = reply_system_prompt(&context);
    let trace = parts
        .trace_turns
        .then(|| turn_trace(reply_prompt_blocks(&context), &turn_style, &system));
    let request = GenerationRequest {
        system: Some(system),
        messages: reply_messages(&context),
        max_tokens: REPLY_MAX_TOKENS,
        context: CallContext {
            purpose: CallPurpose::Reply,
            prompt_version: REPLY_PROMPT_VERSION,
            session_id: Some(session.id().to_owned()),
        },
    };
    (request, trace)
}

/// 발화 요청의 추적: 지시문 버전, 조립 순서의 블록 이름과 글자 수, 화법 결정, 모델에 준 시스템 프롬프트 전문.
fn turn_trace(blocks: Vec<PromptBlock>, turn_style: &TurnStyle, system: &str) -> TurnTrace {
    TurnTrace {
        prompt_version: REPLY_PROMPT_VERSION.to_owned(),
        blocks: blocks
            .into_iter()
            .map(|block| TraceBlock {
                name: block.name.to_owned(),
                chars: block.text.chars().count(),
            })
            .collect(),
        turn_style: turn_style.decisions(),
        system_prompt: system.to_owned(),
    }
}

/// 이 세션의 기록(재개 인사의 직전 세션은 넣지 않는다)을 동반자 답과 사용자 말로 갈라 이번 턴의 화법을 정한다.
/// 직전 답의 판정은 부르는 쪽이 `after_judgement` 로 더한다.
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
