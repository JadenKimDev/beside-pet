//! 세션 애그리게이트: 한 대화의 상태(과제, 재시도, 지원 수준, 닫힘, 전사, 턴 분석, 리포트)와 그 전이.
//!
//! 상태는 메서드로만 바뀐다. 닫힌 세션은 사용자 턴을 받지 않고, 리포트는 닫혔고 과제 2 이상일 때 한 번만 붙는다(ADR-0005, ADR-0008).
//! 계획과 요약은 저장하지 않고 프로필과 전사·분석에서 규칙으로 다시 구한다. 시각은 부르는 쪽이 넘긴다.

#![allow(dead_code, unused_imports)] // S4(흐름)가 연결하면 쓰인다. 그때 지운다

use std::fmt;

use chrono::{DateTime, Utc};

use super::response::{
    KnowledgeRefResponse, MessageRole, ReplyPhase, SessionSummaryResponse, SupportPlanResponse,
};
use super::rules::{
    GriefProfile, MindReport, RiskAssessment, SupportLevel, Task, TaskTransition, TurnAnalysis,
    evaluate, is_report_available, plan, review, should_review, summarize,
};
use crate::identity::ChatLanguage;

mod message;
mod snapshot;
mod view;

pub use message::Message;
pub use snapshot::SessionSnapshot;

/// 세션의 불변식을 어긴 요청.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionError {
    /// 닫힌 세션에 사용자 턴이 왔다(HTTP 409).
    Closed,
    /// 리포트를 열 수 없는 세션이다(닫히지 않았거나 과제 2 전, HTTP 409).
    ReportUnavailable,
    /// 리포트가 이미 있다(write-once).
    ReportAlreadyWritten,
}

impl fmt::Display for SessionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = match self {
            SessionError::Closed => "session is already closed",
            SessionError::ReportUnavailable => "report is not available for this session",
            SessionError::ReportAlreadyWritten => "report is already written",
        };
        f.write_str(text)
    }
}

impl std::error::Error for SessionError {}

/// 사용자 턴 하나를 적용한 결과: 답을 쓰고 턴 분석을 남기는 데 필요한 구조.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TurnStep {
    /// 이 턴 전의 과제.
    pub from: Task,
    /// 이 턴 뒤의 과제(위기면 `from` 과 같다).
    pub to: Task,
    pub advanced: bool,
    /// 답의 단계. 위기와 클로징은 `Closing` 이다.
    pub phase: ReplyPhase,
    /// 이 턴의 위기 판정.
    pub level: SupportLevel,
}

impl TurnStep {
    /// 위기로 닫혔는가(고정 문구를 보내고 모델을 부르지 않는다). 세션은 이미 닫혔다.
    pub fn is_crisis(&self) -> bool {
        self.level.is_crisis()
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
            report: self.report.clone(),
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn owner_id(&self) -> &str {
        &self.owner_id
    }

    pub fn started_at(&self) -> DateTime<Utc> {
        self.started_at
    }

    pub fn grief_profile(&self) -> &GriefProfile {
        &self.grief_profile
    }

    pub fn task(&self) -> Task {
        self.task
    }

    pub fn retry_count(&self) -> u32 {
        self.retry_count
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

    pub fn analyses(&self) -> &[TurnAnalysis] {
        &self.analyses
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

    /// 사용자 턴 하나를 적용한다: 전사에 적고, 지원 수준을 올리고(내려가지 않는다), 위기면 닫고,
    /// 아니면 깊이 게이트로 과제를 넘기거나 머문다. 클로징에 닿아도 여기서는 닫지 않는다
    /// (스트림의 `meta` 가 답 전에 나가므로, 답을 적은 뒤 부르는 쪽이 `close` 한다. `TurnStep::closes`).
    pub fn apply_user_turn(
        &mut self,
        text: &str,
        level: SupportLevel,
        at: DateTime<Utc>,
    ) -> Result<TurnStep, SessionError> {
        if self.closed {
            return Err(SessionError::Closed);
        }
        self.push(MessageRole::User, text, at);
        self.support_level = self.support_level.raised(level);
        let from = self.task;
        if level.is_crisis() {
            self.closed = true;
            return Ok(TurnStep {
                from,
                to: from,
                advanced: false,
                phase: ReplyPhase::Closing,
                level,
            });
        }
        let answers: Vec<&str> = self
            .history
            .iter()
            .filter(|message| message.role == MessageRole::User && message.task == from)
            .map(|message| message.text.as_str())
            .collect();
        let progression = evaluate(&answers);
        if progression.advanced {
            self.task = from.next();
            self.retry_count = 0;
        } else {
            self.retry_count += 1;
        }
        let phase = if self.task.is_closing() {
            ReplyPhase::Closing
        } else if progression.advanced {
            ReplyPhase::Task
        } else if progression.last_engaged {
            ReplyPhase::Deepen
        } else {
            ReplyPhase::Retry
        };
        Ok(TurnStep {
            from,
            to: self.task,
            advanced: progression.advanced,
            phase,
            level,
        })
    }

    /// 상대(assistant)의 답을 지금 과제로 적는다. 위기 답은 닫힌 뒤에 적는다.
    pub fn record_reply(&mut self, text: &str, at: DateTime<Utc>) {
        self.push(MessageRole::Assistant, text, at);
    }

    /// 턴 분석을 남긴다. 감독 게이트가 열리면 Supervisor 가 답을 본다.
    pub fn record_turn(
        &mut self,
        step: &TurnStep,
        reply: &str,
        knowledge: Vec<KnowledgeRefResponse>,
        at: DateTime<Utc>,
    ) {
        let turn_index = self.analyses.len();
        let supervision =
            should_review(step.advanced, step.level, turn_index).then(|| review(reply, step.level));
        self.analyses.push(TurnAnalysis {
            at,
            task: self.task,
            phase: step.phase,
            risk: RiskAssessment::of(step.level),
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
    fn push(&mut self, role: MessageRole, text: &str, at: DateTime<Utc>) {
        self.history.push(Message {
            role,
            text: text.to_owned(),
            task: self.task,
            at,
        });
    }
}

#[cfg(test)]
mod tests;
