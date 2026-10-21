//! 세션 애그리게이트: 한 대화의 상태(과제, 재시도, 지원 수준, 닫힘, 전사, 턴, 턴 분석, 리포트)와 그 전이.
//!
//! 상태는 메서드로만 바뀐다. 닫힌 세션은 사용자 턴을 받지 않고, 리포트는 닫혔고 과제 2 이상일 때 한 번만 붙는다(ADR-0005, ADR-0008).
//! 사용자 턴은 받기(메시지와 `pending` 턴만)와 끝내기(전이 적용, 답, 분석, `done`)로 나뉜다. 상태는 끝난 턴에서만 바뀐다(위기 제외).
//! 계획과 요약은 저장하지 않고 프로필과 전사·분석에서 규칙으로 다시 구한다. 시각은 부르는 쪽이 넘긴다.

use std::fmt;

use chrono::{DateTime, Utc};

use super::response::{
    KnowledgeRefResponse, MessageRole, ReplyPhase, RiskDetector, SessionSummaryResponse,
    SupportPlanResponse,
};
use super::rules::{
    GriefProfile, MindReport, RiskAssessment, SupportLevel, Task, TaskTransition, TurnAnalysis,
    evaluate, is_report_available, plan, review, should_review, summarize,
};
use crate::identity::ChatLanguage;

mod activity;
mod message;
mod snapshot;
mod turn;
mod view;

pub use activity::MessageActivity;
pub use message::Message;
pub use snapshot::SessionSnapshot;
pub use turn::{Turn, TurnErrorKind, TurnStatus};

/// 세션의 불변식을 어긴 요청.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionError {
    /// 닫힌 세션에 사용자 턴이 왔다(HTTP 409).
    Closed,
    /// 리포트를 열 수 없는 세션이다(닫히지 않았거나 과제 2 전, HTTP 409).
    ReportUnavailable,
    /// 리포트가 이미 있다(write-once).
    ReportAlreadyWritten,
    /// 같은 세션에 같은 턴 id 가 이미 있다(HTTP 409 "Turn already received").
    TurnAlreadyReceived,
    /// 그런 턴이 이 세션에 없다.
    TurnNotFound,
    /// 턴이 이미 끝났다(`done` 또는 `failed`).
    TurnNotPending,
}

impl fmt::Display for SessionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = match self {
            SessionError::Closed => "session is already closed",
            SessionError::ReportUnavailable => "report is not available for this session",
            SessionError::ReportAlreadyWritten => "report is already written",
            SessionError::TurnAlreadyReceived => "turn is already received",
            SessionError::TurnNotFound => "turn is not in this session",
            SessionError::TurnNotPending => "turn is already finished",
        };
        f.write_str(text)
    }
}

impl std::error::Error for SessionError {}

/// 사용자 턴 하나의 전이: 답을 쓰고 턴 분석을 남기는 데 필요한 구조.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TurnStep {
    /// 이 턴 전의 과제.
    pub from: Task,
    /// 이 턴 뒤의 과제(위기면 `from` 과 같다).
    pub to: Task,
    pub advanced: bool,
    /// 답의 단계. 위기와 클로징은 `Closing` 이다.
    pub phase: ReplyPhase,
    /// 이 턴의 위기 판정(수준과 감지 주체). 턴 분석에 그대로 적힌다.
    pub risk: RiskAssessment,
}

impl TurnStep {
    /// 위기로 닫혔는가(고정 문구를 보내고 모델을 부르지 않는다). 세션은 이미 닫혔다.
    pub fn is_crisis(&self) -> bool {
        self.risk.level.is_crisis()
    }

    /// 이 턴의 답 뒤에 세션을 닫아야 하는가(클로징에 닿았거나 위기).
    pub fn closes(&self) -> bool {
        self.phase == ReplyPhase::Closing
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Session {
    id: String,
    owner_id: String,
    started_at: DateTime<Utc>,
    grief_profile: GriefProfile,
    task: Task,
    retry_count: u32,
    support_level: SupportLevel,
    closed: bool,
    history: Vec<Message>,
    analyses: Vec<TurnAnalysis>,
    turns: Vec<Turn>,
    report: Option<MindReport>,
}

impl Session {
    /// 새 세션. 처음이면 `Task::FIRST`, 이어 가면 직전 세션이 닿은 과제에서 시작한다.
    pub fn start(
        id: String,
        owner_id: String,
        grief_profile: GriefProfile,
        started_at: DateTime<Utc>,
        start_task: Task,
    ) -> Session {
        Session {
            id,
            owner_id,
            started_at,
            grief_profile,
            task: start_task,
            retry_count: 0,
            support_level: SupportLevel::Safe,
            closed: false,
            history: Vec::new(),
            analyses: Vec::new(),
            turns: Vec::new(),
            report: None,
        }
    }

    /// 저장에서 되살린다.
    pub fn rehydrate(snapshot: SessionSnapshot) -> Session {
        Session {
            id: snapshot.id,
            owner_id: snapshot.owner_id,
            started_at: snapshot.started_at,
            grief_profile: snapshot.grief_profile,
            task: snapshot.task,
            retry_count: snapshot.retry_count,
            support_level: snapshot.support_level,
            closed: snapshot.closed,
            history: snapshot.history,
            analyses: snapshot.analyses,
            turns: snapshot.turns,
            report: snapshot.report,
        }
    }

    /// 저장에 넘기는 모양.
    pub fn snapshot(&self) -> SessionSnapshot {
        SessionSnapshot {
            id: self.id.clone(),
            owner_id: self.owner_id.clone(),
            started_at: self.started_at,
            grief_profile: self.grief_profile.clone(),
            task: self.task,
            retry_count: self.retry_count,
            support_level: self.support_level,
            closed: self.closed,
            history: self.history.clone(),
            analyses: self.analyses.clone(),
            turns: self.turns.clone(),
            report: self.report.clone(),
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn started_at(&self) -> DateTime<Utc> {
        self.started_at
    }

    pub fn owner_id(&self) -> &str {
        &self.owner_id
    }

    pub fn grief_profile(&self) -> &GriefProfile {
        &self.grief_profile
    }

    pub fn task(&self) -> Task {
        self.task
    }

    pub fn support_level(&self) -> SupportLevel {
        self.support_level
    }

    pub fn closed(&self) -> bool {
        self.closed
    }

    pub fn history(&self) -> &[Message] {
        &self.history
    }

    pub fn report(&self) -> Option<&MindReport> {
        self.report.as_ref()
    }

    pub fn progress(&self) -> f64 {
        self.task.progress()
    }

    pub fn report_available(&self) -> bool {
        is_report_available(self.task, self.closed)
    }

    /// 계정의 대화 언어를 따른다(다음 턴부터).
    pub fn adopt_language(&mut self, language: ChatLanguage) {
        self.grief_profile.preferred_language = Some(language);
    }

    /// 턴 분석을 남긴다. 감독 게이트가 열리면 Supervisor 가 답을 본다.
    fn record_turn(
        &mut self,
        step: &TurnStep,
        reply: &str,
        knowledge: Vec<KnowledgeRefResponse>,
        at: DateTime<Utc>,
    ) {
        let turn_index = self.analyses.len();
        let level = step.risk.level;
        let supervision =
            should_review(step.advanced, level, turn_index).then(|| review(reply, level));
        self.analyses.push(TurnAnalysis {
            at,
            task: self.task,
            phase: step.phase,
            risk: step.risk,
            transition: TaskTransition {
                from: step.from,
                to: step.to,
                advanced: step.advanced,
                retry_count: self.retry_count,
            },
            knowledge,
            supervision,
        });
    }

    /// 닫는다. 이미 닫혔으면 그대로다.
    pub fn close(&mut self) {
        self.closed = true;
    }

    /// 리포트를 붙인다. 닫혔고 과제 2 이상일 때만, 한 번만.
    pub fn attach_report(&mut self, report: MindReport) -> Result<(), SessionError> {
        if !self.report_available() {
            return Err(SessionError::ReportUnavailable);
        }
        if self.report.is_some() {
            return Err(SessionError::ReportAlreadyWritten);
        }
        self.report = Some(report);
        Ok(())
    }

    /// 지원 계획(Planner). 프로필에서 다시 구하고, 시각은 세션 시작 시각이다.
    pub fn plan(&self) -> SupportPlanResponse {
        plan(&self.grief_profile, self.started_at)
    }

    /// 닫힌 세션의 요약(Summarizer). 열린 세션은 없다. 시각은 마지막 메시지의 시각(없으면 시작 시각)이다.
    pub fn summary(&self) -> Option<SessionSummaryResponse> {
        if !self.closed {
            return None;
        }
        let at = self
            .history
            .last()
            .map_or(self.started_at, |message| message.at);
        let turn_count = u32::try_from(self.analyses.len()).unwrap_or(u32::MAX);
        Some(summarize(self.task, turn_count, self.support_level, at))
    }

    /// 전사에 지금 과제로 한 줄 더한다.
    fn push(&mut self, role: MessageRole, text: &str, at: DateTime<Utc>, turn_id: Option<&str>) {
        self.history.push(Message {
            role,
            text: text.to_owned(),
            task: self.task,
            at,
            turn_id: turn_id.map(str::to_owned),
        });
    }

    /// 깊이에 세는 사용자 메시지인가: 턴 없는 옛 메시지, 끝난 턴의 것, 지금 턴(`current`)의 것.
    fn counts_toward_depth(&self, message: &Message, current: Option<&str>) -> bool {
        match message.turn_id.as_deref() {
            None => true,
            Some(id) if Some(id) == current => true,
            Some(id) => self
                .turns
                .iter()
                .any(|turn| turn.id == id && turn.status == TurnStatus::Done),
        }
    }

    /// 이 판정으로 지금 과제에서 낼 전이. 세션을 바꾸지 않는다.
    fn step_for(&self, current: Option<&str>, risk: RiskAssessment) -> TurnStep {
        let from = self.task;
        if risk.level.is_crisis() {
            return TurnStep {
                from,
                to: from,
                advanced: false,
                phase: ReplyPhase::Closing,
                risk,
            };
        }
        let answers: Vec<&str> = self
            .history
            .iter()
            .filter(|message| message.role == MessageRole::User && message.task == from)
            .filter(|message| self.counts_toward_depth(message, current))
            .map(|message| message.text.as_str())
            .collect();
        let progression = evaluate(&answers);
        let to = if progression.advanced {
            from.next()
        } else {
            from
        };
        let phase = if to.is_closing() {
            ReplyPhase::Closing
        } else if progression.advanced {
            ReplyPhase::Task
        } else if progression.last_engaged {
            ReplyPhase::Deepen
        } else {
            ReplyPhase::Retry
        };
        TurnStep {
            from,
            to,
            advanced: progression.advanced,
            phase,
            risk,
        }
    }

    /// 전이를 적용한다: 지원 수준을 올리고, 위기면 닫고, 아니면 과제를 넘기거나 재시도를 센다. 클로징은 닫지 않는다.
    fn apply_step(&mut self, step: &TurnStep) {
        self.support_level = self.support_level.raised(step.risk.level);
        if step.is_crisis() {
            self.closed = true;
        } else if step.advanced {
            self.task = step.to;
            self.retry_count = 0;
        } else {
            self.retry_count += 1;
        }
    }
}

/// 턴 단위의 흐름: 받기, 전이 계산, 끝내기, 실패, 위기, 첫 인사.
impl Session {
    /// 받은 순서대로의 턴.
    pub fn turns(&self) -> &[Turn] {
        &self.turns
    }

    /// 사용자 메시지를 받는다: 전사에 지금 과제로 적고 `pending` 턴을 만든다. 세션 상태(과제, 재시도, 지원 수준, 닫힘)는 바꾸지 않는다.
    /// 안전 확인은 부르는 쪽이 먼저 한다. 위기면 `accept_crisis_turn` 을 쓴다.
    pub fn accept_user_turn(
        &mut self,
        turn_id: String,
        text: &str,
        at: DateTime<Utc>,
    ) -> Result<(), SessionError> {
        self.ensure_new_turn(&turn_id)?;
        if self.closed {
            return Err(SessionError::Closed);
        }
        self.push(MessageRole::User, text, at, Some(&turn_id));
        self.turns.push(Turn::pending(turn_id, at));
        Ok(())
    }

    /// `pending` 턴의 전이를 계산한다. 세션을 바꾸지 않는다. 같은 전사와 같은 판정이면 같은 결과다(깊이 게이트는 결정론, ADR-0005).
    /// 깊이는 지금 과제의 사용자 메시지 중 끝난 턴(과 턴 없는 옛 메시지)과 이 턴의 것만 센다. 실패하거나 아직 도는 다른 턴은 세지 않는다.
    pub fn transition(
        &self,
        turn_id: &str,
        risk: RiskAssessment,
    ) -> Result<TurnStep, SessionError> {
        self.pending_turn(turn_id)?;
        Ok(self.step_for(Some(turn_id), risk))
    }

    /// `pending` 턴을 끝낸다: 전이를 적용하고(지원 수준, 과제, 재시도, 클로징·위기면 닫기), 답과 턴 분석을 적고, 턴을 `done` 으로 닫는다.
    pub fn complete_turn(
        &mut self,
        turn_id: &str,
        risk: RiskAssessment,
        reply: &str,
        knowledge: Vec<KnowledgeRefResponse>,
        at: DateTime<Utc>,
    ) -> Result<TurnStep, SessionError> {
        let step = self.transition(turn_id, risk)?;
        self.apply_step(&step);
        self.push(MessageRole::Assistant, reply, at, Some(turn_id));
        self.record_turn(&step, reply, knowledge, at);
        if step.closes() {
            self.closed = true;
        }
        self.pending_turn_mut(turn_id)?.finish(at);
        Ok(step)
    }

    /// `pending` 턴을 `failed` 로 닫는다. 사용자 메시지는 남고 세션 상태는 움직이지 않는다.
    pub fn fail_turn(
        &mut self,
        turn_id: &str,
        kind: TurnErrorKind,
        at: DateTime<Utc>,
    ) -> Result<(), SessionError> {
        self.pending_turn_mut(turn_id)?.fail(kind, at);
        Ok(())
    }

    /// 위기 턴은 받자마자 끝낸다: 메시지를 받고, 닫고, 고정 문구(부르는 쪽이 `safety` 에서 넘긴다)를 적고, 턴은 바로 `done` 이다(ADR-0004).
    /// 수준은 위기이고, 누가 잡았는지(`detected_by`)는 부르는 쪽이 `safety` 의 판정에서 넘긴다.
    pub fn accept_crisis_turn(
        &mut self,
        turn_id: String,
        text: &str,
        reply: &str,
        detected_by: RiskDetector,
        at: DateTime<Utc>,
    ) -> Result<TurnStep, SessionError> {
        let id = turn_id.clone();
        self.accept_user_turn(turn_id, text, at)?;
        let risk = RiskAssessment {
            level: SupportLevel::Crisis,
            detected_by,
        };
        self.complete_turn(&id, risk, reply, Vec::new(), at)
    }

    /// 첫 인사: 사용자 메시지 없는 턴 하나. 답을 지금 과제로 적고 턴은 바로 `done` 이다. 턴 분석은 남기지 않는다.
    pub fn greet(
        &mut self,
        turn_id: String,
        reply: &str,
        at: DateTime<Utc>,
    ) -> Result<(), SessionError> {
        self.ensure_new_turn(&turn_id)?;
        self.push(MessageRole::Assistant, reply, at, Some(&turn_id));
        let mut turn = Turn::pending(turn_id, at);
        turn.finish(at);
        self.turns.push(turn);
        Ok(())
    }

    fn ensure_new_turn(&self, turn_id: &str) -> Result<(), SessionError> {
        if self.turns.iter().any(|turn| turn.id == turn_id) {
            return Err(SessionError::TurnAlreadyReceived);
        }
        Ok(())
    }

    fn pending_turn(&self, turn_id: &str) -> Result<&Turn, SessionError> {
        let turn = self
            .turns
            .iter()
            .find(|turn| turn.id == turn_id)
            .ok_or(SessionError::TurnNotFound)?;
        if !turn.is_pending() {
            return Err(SessionError::TurnNotPending);
        }
        Ok(turn)
    }

    fn pending_turn_mut(&mut self, turn_id: &str) -> Result<&mut Turn, SessionError> {
        self.pending_turn(turn_id)?;
        self.turns
            .iter_mut()
            .find(|turn| turn.id == turn_id)
            .ok_or(SessionError::TurnNotFound)
    }
}

#[cfg(test)]
mod tests;
