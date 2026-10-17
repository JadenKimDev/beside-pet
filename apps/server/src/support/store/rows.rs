//! 행의 모양: 스냅샷을 쓸 칸 묶음으로 펴고, 읽은 세션·메시지·턴 분석 행을 스냅샷으로 모은다.

use std::collections::HashMap;

use chrono::{DateTime, Utc};

use super::super::rules::{RiskAssessment, TaskTransition, TurnAnalysis};
use super::super::session::{Message, MessageActivity, SessionSnapshot};
use super::codec::{
    KnowledgeDocument, SupervisionDocument, count_number, detector_text, from_document,
    level_number, parse_count, parse_detector, parse_level, parse_phase, parse_role, parse_task,
    phase_text, role_text, task_number, to_document,
};

/// `messages` 에 한 번에 쓰는 칸들(`UNNEST` 의 배열). 자리 i 가 순번 i 다.
pub(super) struct MessageColumns<'a> {
    pub seq: Vec<i32>,
    pub role: Vec<&'static str>,
    pub text: Vec<&'a str>,
    pub task: Vec<i32>,
    pub at: Vec<DateTime<Utc>>,
}

impl<'a> MessageColumns<'a> {
    pub(super) fn of(history: &'a [Message]) -> Result<MessageColumns<'a>, sqlx::Error> {
        let mut columns = MessageColumns {
            seq: Vec::with_capacity(history.len()),
            role: Vec::with_capacity(history.len()),
            text: Vec::with_capacity(history.len()),
            task: Vec::with_capacity(history.len()),
            at: Vec::with_capacity(history.len()),
        };
        for (seq, message) in history.iter().enumerate() {
            columns.seq.push(seq_number("messages.seq", seq)?);
            columns.role.push(role_text(message.role));
            columns.text.push(&message.text);
            columns.task.push(task_number(message.task));
            columns.at.push(message.at);
        }
        Ok(columns)
    }

    /// 전사의 길이. 이 순번부터는 전사에 없는 행이다.
    pub(super) fn length(&self) -> i32 {
        self.seq.last().map_or(0, |seq| seq + 1)
    }
}

/// `turn_analyses` 에 한 번에 쓰는 칸들. JSONB 는 글로 넘기고 SQL 이 `::jsonb` 로 바꾼다.
#[derive(Default)]
pub(super) struct AnalysisColumns {
    pub seq: Vec<i32>,
    pub at: Vec<DateTime<Utc>>,
    pub task: Vec<i32>,
    pub phase: Vec<&'static str>,
    pub risk_level: Vec<i32>,
    pub risk_detected_by: Vec<&'static str>,
    pub from_task: Vec<i32>,
    pub to_task: Vec<i32>,
    pub advanced: Vec<bool>,
    pub retry_count: Vec<i32>,
    pub knowledge: Vec<String>,
    pub supervision: Vec<Option<String>>,
}

impl AnalysisColumns {
    pub(super) fn of(analyses: &[TurnAnalysis]) -> Result<AnalysisColumns, sqlx::Error> {
        let mut columns = AnalysisColumns::default();
        for (seq, analysis) in analyses.iter().enumerate() {
            let knowledge: Vec<KnowledgeDocument> = analysis
                .knowledge
                .iter()
                .map(KnowledgeDocument::of)
                .collect();
            let supervision = match &analysis.supervision {
                Some(supervision) => Some(to_document(
                    "turn_analyses.supervision",
                    &SupervisionDocument::of(supervision),
                )?),
                None => None,
            };
            columns.seq.push(seq_number("turn_analyses.seq", seq)?);
            columns.at.push(analysis.at);
            columns.task.push(task_number(analysis.task));
            columns.phase.push(phase_text(analysis.phase));
            columns.risk_level.push(level_number(analysis.risk.level));
            columns
                .risk_detected_by
                .push(detector_text(analysis.risk.detected_by));
            columns
                .from_task
                .push(task_number(analysis.transition.from));
            columns.to_task.push(task_number(analysis.transition.to));
            columns.advanced.push(analysis.transition.advanced);
            columns.retry_count.push(count_number(
                "turn_analyses.retry_count",
                analysis.transition.retry_count,
            )?);
            columns
                .knowledge
                .push(to_document("turn_analyses.knowledge", &knowledge)?);
            columns.supervision.push(supervision);
        }
        Ok(columns)
    }
}

fn seq_number(column: &str, seq: usize) -> Result<i32, sqlx::Error> {
    count_number(column, u32::try_from(seq).unwrap_or(u32::MAX))
}

/// `sessions` 행. JSONB 는 `::text` 로 읽는다.
#[derive(sqlx::FromRow)]
pub(super) struct SessionRow {
    pub id: String,
    owner_id: String,
    task: i32,
    retry_count: i32,
    support_level: i32,
    closed: bool,
    grief_profile: String,
    report: Option<String>,
    created_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
pub(super) struct MessageRow {
    session_id: String,
    role: String,
    text: String,
    task: i32,
    at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
pub(super) struct AnalysisRow {
    session_id: String,
    at: DateTime<Utc>,
    task: i32,
    phase: String,
    risk_level: i32,
    risk_detected_by: String,
    from_task: i32,
    to_task: i32,
    advanced: bool,
    retry_count: i32,
    knowledge: String,
    supervision: Option<String>,
}

/// 세션 하나의 메시지 집계 행(`GROUP BY session_id`). 메시지가 있는 세션만 행이 있다.
#[derive(sqlx::FromRow)]
pub(super) struct ActivityRow {
    pub session_id: String,
    last_message_at: DateTime<Utc>,
    duration_minutes: i32,
    message_count: i32,
}

impl ActivityRow {
    pub(super) fn into_activity(self) -> Result<MessageActivity, sqlx::Error> {
        Ok(MessageActivity {
            last_message_at: Some(self.last_message_at),
            duration_minutes: Some(parse_count(
                "messages.duration_minutes",
                self.duration_minutes,
            )?),
            message_count: parse_count("messages.message_count", self.message_count)?,
        })
    }
}

impl MessageRow {
    fn into_message(self) -> Result<Message, sqlx::Error> {
        Ok(Message {
            role: parse_role(&self.role)?,
            task: parse_task("messages.task", self.task)?,
            text: self.text,
            at: self.at,
        })
    }
}

impl AnalysisRow {
    fn into_analysis(self) -> Result<TurnAnalysis, sqlx::Error> {
        let knowledge: Vec<KnowledgeDocument> =
            from_document("turn_analyses.knowledge", &self.knowledge)?;
        let supervision = match self.supervision.as_deref() {
            // JSONB 의 `null` 도 없음이다.
            Some(text) => {
                match from_document::<Option<SupervisionDocument>>(
                    "turn_analyses.supervision",
                    text,
                )? {
                    Some(document) => Some(document.into_response()?),
                    None => None,
                }
            }
            None => None,
        };
        Ok(TurnAnalysis {
            at: self.at,
            task: parse_task("turn_analyses.task", self.task)?,
            phase: parse_phase(&self.phase)?,
            risk: RiskAssessment {
                level: parse_level("turn_analyses.risk_level", self.risk_level)?,
                detected_by: parse_detector(&self.risk_detected_by)?,
            },
            transition: TaskTransition {
                from: parse_task("turn_analyses.from_task", self.from_task)?,
                to: parse_task("turn_analyses.to_task", self.to_task)?,
                advanced: self.advanced,
                retry_count: parse_count("turn_analyses.retry_count", self.retry_count)?,
            },
            knowledge: knowledge
                .into_iter()
                .map(KnowledgeDocument::into_ref)
                .collect(),
            supervision,
        })
    }
}

/// 세션들의 메시지와 턴 분석. 행은 세션 안의 순번 순서로 온다.
#[derive(Default)]
pub(super) struct Transcripts {
    history: HashMap<String, Vec<Message>>,
    analyses: HashMap<String, Vec<TurnAnalysis>>,
}

impl Transcripts {
    pub(super) fn collect(
        messages: Vec<MessageRow>,
        analyses: Vec<AnalysisRow>,
    ) -> Result<Transcripts, sqlx::Error> {
        let mut transcripts = Transcripts::default();
        for row in messages {
            let id = row.session_id.clone();
            transcripts
                .history
                .entry(id)
                .or_default()
                .push(row.into_message()?);
        }
        for row in analyses {
            let id = row.session_id.clone();
            transcripts
                .analyses
                .entry(id)
                .or_default()
                .push(row.into_analysis()?);
        }
        Ok(transcripts)
    }

    /// 세션 행에 그 세션의 메시지와 분석을 붙여 스냅샷을 만든다.
    pub(super) fn snapshot(&mut self, row: SessionRow) -> Result<SessionSnapshot, sqlx::Error> {
        Ok(SessionSnapshot {
            grief_profile: from_document("sessions.grief_profile", &row.grief_profile)?,
            task: parse_task("sessions.task", row.task)?,
            retry_count: parse_count("sessions.retry_count", row.retry_count)?,
            support_level: parse_level("sessions.support_level", row.support_level)?,
            report: match row.report.as_deref() {
                Some(text) => from_document("sessions.report", text)?,
                None => None,
            },
            closed: row.closed,
            started_at: row.created_at,
            history: self.history.remove(&row.id).unwrap_or_default(),
            analyses: self.analyses.remove(&row.id).unwrap_or_default(),
            owner_id: row.owner_id,
            id: row.id,
        })
    }
}
