//! 대화 저장: `sessions`·`messages`·`turn_analyses`·`turns` 의 SQL. 기억 테이블의 SQL 은 `memory` 가 맡는다.
//!
//! 스냅샷 하나는 세션 행 하나, 메시지 행(순번 = 전사의 자리), 턴 분석 행(순번 = 분석의 자리, 답의 판정 칸과 sandbox 의 추적 칸 포함), 턴 행(id = 클라이언트의
//! 멱등 키, ADR-0028)이다. 저장은 한 트랜잭션의 upsert 라 두 번 해도 같고, 턴의 상태 전이도 upsert 로 덮인다. 턴은 일어난
//! 사실이라 스냅샷에서 빠져도 지우지 않는다. 계획·요약·진행률은 규칙으로 다시 구하므로 저장하지 않는다. 삭제는 한
//! 트랜잭션으로 그 세션의 기억(memory_optouts → memory_notes → pets) → turn_analyses → messages → turns → sessions
//! 순서로 지운다. 사용자의 삭제는 `deleted_at` 만 적고(`trash`), 행을 지우는 것은 기동 때의 파기(`purge`)뿐이다(ADR-0036).
//! 세션을 읽는 길은 지운 세션과 지운 리포트를 없음으로 본다. 시각은 timestamptz 라 마이크로초까지 남는다.

use std::collections::HashMap;
use std::fmt;

use chrono::{DateTime, Utc};
use sqlx::{AssertSqlSafe, PgPool, Postgres, Transaction};

use super::session::{MessageActivity, SessionSnapshot, TurnErrorKind, TurnStatus};
use crate::identity::AccountActivity;
use codec::{count_number, level_number, task_number, to_document};
use rows::{
    ActivityRow, AnalysisColumns, AnalysisRow, MessageColumns, MessageRow, OwnerActivityRow,
    SessionRow, Transcripts, TurnColumns, TurnRow,
};

mod codec;
mod memory;
mod purge;
mod rows;
mod trash;

pub use memory::PgMemoryStore;
pub use purge::{TRASH_RETENTION_MONTHS, TrashPurge};
pub use trash::DeletedSession;

const SESSION_COLUMNS: &str = "id, owner_id, task, retry_count, support_level, closed, \
                               grief_profile::text AS grief_profile, \
                               CASE WHEN report_deleted_at IS NULL THEN report::text END AS report, \
                               created_at";

/// 저장의 오류. 문구에 본문과 식별 정보를 싣지 않는다.
#[derive(Debug)]
pub enum StoreError {
    Database(sqlx::Error),
    /// 같은 id 의 세션이 다른 소유자의 것이다. 아무것도 쓰지 않았다.
    OwnerMismatch,
    /// 스냅샷의 턴 id 가 이미 다른 세션의 턴이다(`turns.id` 는 전역 키). 아무것도 쓰지 않았다.
    TurnIdTaken,
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::Database(error) => write!(f, "session store: {error}"),
            StoreError::OwnerMismatch => f.write_str("session belongs to another owner"),
            StoreError::TurnIdTaken => f.write_str("turn id belongs to another session"),
        }
    }
}

impl std::error::Error for StoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            StoreError::Database(error) => Some(error),
            StoreError::OwnerMismatch | StoreError::TurnIdTaken => None,
        }
    }
}

impl From<sqlx::Error> for StoreError {
    fn from(error: sqlx::Error) -> StoreError {
        StoreError::Database(error)
    }
}

/// 세션을 읽고 쓰는 곳. 풀을 복제해 들고 다닌다.
#[derive(Debug, Clone)]
pub struct SessionStore {
    pool: PgPool,
}

impl SessionStore {
    pub fn new(pool: PgPool) -> SessionStore {
        SessionStore { pool }
    }

    /// 세션 행을 넣거나 갱신하고, 턴을 id 로, 메시지와 턴 분석을 순번으로 upsert 한다. 한 트랜잭션이다.
    /// 턴은 메시지보다 먼저 쓴다(`messages.turn_id` 의 FK). 전사가 줄었으면 새 길이 뒤의 메시지 행을 지운다.
    /// 지운 리포트(읽기에서 없음으로 보인 것)는 덮지 않는다. 소유자와 시작 시각은 처음 쓴 값이 남는다. 같은 id 가 다른 소유자의 것이면 `OwnerMismatch`, 턴 id 가 다른 세션의
    /// 것이면 `TurnIdTaken` 이고 둘 다 아무것도 쓰지 않는다.
    pub async fn save(&self, snapshot: &SessionSnapshot) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let written = sqlx::query(
            "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, \
                                   grief_profile, report, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, now()) \
             ON CONFLICT (id) DO UPDATE SET \
               task = EXCLUDED.task, retry_count = EXCLUDED.retry_count, \
               support_level = EXCLUDED.support_level, closed = EXCLUDED.closed, \
               grief_profile = EXCLUDED.grief_profile, \
               report = CASE WHEN sessions.report_deleted_at IS NULL THEN EXCLUDED.report \
                             ELSE sessions.report END, \
               updated_at = now() \
             WHERE sessions.owner_id = EXCLUDED.owner_id",
        )
        .bind(&snapshot.id)
        .bind(&snapshot.owner_id)
        .bind(task_number(snapshot.task))
        .bind(count_number("sessions.retry_count", snapshot.retry_count)?)
        .bind(level_number(snapshot.support_level))
        .bind(snapshot.closed)
        .bind(to_document(
            "sessions.grief_profile",
            &snapshot.grief_profile,
        )?)
        .bind(match &snapshot.report {
            Some(report) => Some(to_document("sessions.report", report)?),
            None => None,
        })
        .bind(snapshot.started_at)
        .execute(&mut *tx)
        .await?;
        if written.rows_affected() == 0 {
            // 떨어뜨린 트랜잭션은 되돌려진다.
            return Err(StoreError::OwnerMismatch);
        }
        save_turns(&mut tx, &snapshot.id, TurnColumns::of(&snapshot.turns)).await?;
        save_messages(
            &mut tx,
            &snapshot.id,
            MessageColumns::of(&snapshot.history)?,
        )
        .await?;
        save_analyses(
            &mut tx,
            &snapshot.id,
            AnalysisColumns::of(&snapshot.analyses)?,
        )
        .await?;
        tx.commit().await?;
        Ok(())
    }

    /// 기동 때 정리: `pending`·`streaming` 으로 남은 모든 턴(앞 프로세스가 답을 끝내지 못한 턴)을 `failed`·`restart`·`at` 으로
    /// 닫는다. 바꾼 행 수를 돌려준다.
    pub async fn fail_pending_turns(&self, at: DateTime<Utc>) -> Result<u64, StoreError> {
        let closed = sqlx::query(
            "UPDATE turns SET status = $1, error_kind = $2, finished_at = $3 \
             WHERE status IN ($4, $5)",
        )
        .bind(TurnStatus::Failed.as_str())
        .bind(TurnErrorKind::Restart.as_str())
        .bind(at)
        .bind(TurnStatus::Pending.as_str())
        .bind(TurnStatus::Streaming.as_str())
        .execute(&self.pool)
        .await?;
        Ok(closed.rows_affected())
    }

    /// 살아 있는 세션 하나. 지운 세션은 없음과 같다.
    pub async fn find(&self, id: &str) -> Result<Option<SessionSnapshot>, StoreError> {
        let mut snapshots = self
            .read(
                AssertSqlSafe(format!(
                    "SELECT {SESSION_COLUMNS} FROM sessions WHERE id = $1 AND deleted_at IS NULL"
                )),
                id,
                None,
            )
            .await?;
        Ok(snapshots.pop())
    }

    /// 소유자의 살아 있는 세션을 시작이 늦은 것부터 `limit` 개까지.
    pub async fn find_by_owner(
        &self,
        owner_id: &str,
        limit: u32,
    ) -> Result<Vec<SessionSnapshot>, StoreError> {
        self.read(
            AssertSqlSafe(format!(
                "SELECT {SESSION_COLUMNS} FROM sessions WHERE owner_id = $1 AND deleted_at IS NULL \
                 ORDER BY created_at DESC, id DESC LIMIT $2"
            )),
            owner_id,
            Some(i64::from(limit)),
        )
        .await
    }

    /// 소유자의 직전 세션과 그 마지막 활동 시각: 마지막 메시지 시각(`messages` 의 `max(at)`, 메시지가 없으면
    /// `sessions.created_at`)이 가장 늦은 살아 있는 세션이다. 같으면 시작이 늦은 것, 그다음 id 가 큰 것. 없으면 `None`.
    pub async fn latest_by_owner(
        &self,
        owner_id: &str,
    ) -> Result<Option<(SessionSnapshot, DateTime<Utc>)>, StoreError> {
        let latest: Option<(String, DateTime<Utc>)> = sqlx::query_as(
            "SELECT s.id, coalesce(m.last_at, s.created_at) AS last_active_at \
             FROM sessions s \
             LEFT JOIN LATERAL (SELECT max(at) AS last_at FROM messages WHERE session_id = s.id) m ON true \
             WHERE s.owner_id = $1 AND s.deleted_at IS NULL \
             ORDER BY last_active_at DESC, s.created_at DESC, s.id DESC LIMIT 1",
        )
        .bind(owner_id)
        .fetch_optional(&self.pool)
        .await?;
        let Some((id, last_active_at)) = latest else {
            return Ok(None);
        };
        // 고른 뒤 그 사이에 지워졌으면 없는 것으로 본다.
        Ok(self
            .find(&id)
            .await?
            .map(|snapshot| (snapshot, last_active_at)))
    }

    /// 세션들의 메시지 집계(마지막 시각, 첫·마지막 사이의 분, 수)를 한 질의로 구한다. 중단한 턴의 메시지는 숨으므로 세지
    /// 않는다. 메시지가 없는 세션은 빠진다.
    pub async fn message_activity(
        &self,
        session_ids: &[&str],
    ) -> Result<HashMap<String, MessageActivity>, StoreError> {
        if session_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows: Vec<ActivityRow> = sqlx::query_as(
            "SELECT session_id, max(at) AS last_message_at, \
                    floor(extract(epoch FROM max(at) - min(at)) / 60)::int4 AS duration_minutes, \
                    count(*)::int4 AS message_count \
             FROM messages m WHERE session_id = ANY($1) \
               AND NOT EXISTS (SELECT 1 FROM turns t WHERE t.id = m.turn_id AND t.status = $2) \
             GROUP BY session_id",
        )
        .bind(session_ids)
        .bind(TurnStatus::Cancelled.as_str())
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| Ok((row.session_id.clone(), row.into_activity()?)))
            .collect()
    }

    /// 소유자마다 살아 있는(보관함에 없는) 세션의 수와 그 세션들의 마지막 메시지 시각. 살아 있는 세션이 없는 소유자는 빠진다.
    pub async fn activity_by_owner(
        &self,
        owner_ids: &[String],
    ) -> Result<HashMap<String, AccountActivity>, StoreError> {
        if owner_ids.is_empty() {
            return Ok(HashMap::new());
        }
        let rows: Vec<OwnerActivityRow> = sqlx::query_as(
            "SELECT s.owner_id, count(*)::int4 AS session_count, max(m.last_at) AS last_active_at \
             FROM sessions s \
             LEFT JOIN LATERAL (SELECT max(at) AS last_at FROM messages WHERE session_id = s.id) m ON true \
             WHERE s.owner_id = ANY($1) AND s.deleted_at IS NULL GROUP BY s.owner_id",
        )
        .bind(owner_ids)
        .fetch_all(&self.pool)
        .await?;
        rows.into_iter()
            .map(|row| Ok((row.owner_id.clone(), row.into_activity()?)))
            .collect()
    }

    /// 소유자에게 살아 있는(지우지 않은) 세션이 있는가.
    pub async fn has_sessions(&self, owner_id: &str) -> Result<bool, StoreError> {
        let (exists,): (bool,) = sqlx::query_as(
            "SELECT EXISTS (SELECT 1 FROM sessions WHERE owner_id = $1 AND deleted_at IS NULL)",
        )
        .bind(owner_id)
        .fetch_one(&self.pool)
        .await?;
        Ok(exists)
    }

    /// 그 세션이 출처인 기억(사실, 옵트아웃, 아이), 턴 분석, 메시지, 턴, 세션 행을 한 트랜잭션으로 지운다(`cascade`).
    /// 없는 id 는 아무것도 하지 않는다.
    pub async fn delete(&self, id: &str) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        cascade(&mut tx, &[id.to_owned()]).await?;
        tx.commit().await?;
        Ok(())
    }

    /// 세션 행을 고르고 그 메시지, 분석, 턴을 붙인다. 네 읽기가 같은 시점을 보도록 한 스냅샷 트랜잭션에서 읽는다.
    async fn read(
        &self,
        sessions: AssertSqlSafe<String>,
        key: &str,
        limit: Option<i64>,
    ) -> Result<Vec<SessionSnapshot>, StoreError> {
        let mut tx = self
            .pool
            .begin_with("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
            .await?;
        let mut query = sqlx::query_as::<_, SessionRow>(sessions).bind(key);
        if let Some(limit) = limit {
            query = query.bind(limit);
        }
        let rows = query.fetch_all(&mut *tx).await?;
        if rows.is_empty() {
            return Ok(Vec::new());
        }
        let ids: Vec<&str> = rows.iter().map(|row| row.id.as_str()).collect();
        let messages: Vec<MessageRow> = sqlx::query_as(
            "SELECT session_id, role, text, task, at, turn_id FROM messages \
             WHERE session_id = ANY($1) ORDER BY session_id, seq",
        )
        .bind(&ids)
        .fetch_all(&mut *tx)
        .await?;
        let analyses: Vec<AnalysisRow> = sqlx::query_as(
            "SELECT session_id, at, task, phase, risk_level, risk_detected_by, from_task, to_task, \
                    advanced, retry_count, knowledge::text AS knowledge, \
                    supervision::text AS supervision, reply_label, reply_label_probability, \
                    reply_judge, trace::text AS trace \
             FROM turn_analyses WHERE session_id = ANY($1) ORDER BY session_id, seq",
        )
        .bind(&ids)
        .fetch_all(&mut *tx)
        .await?;
        let turns: Vec<TurnRow> = sqlx::query_as(
            "SELECT session_id, id, status, started_at, finished_at, error_kind FROM turns \
             WHERE session_id = ANY($1) ORDER BY session_id, started_at, id",
        )
        .bind(&ids)
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
        let mut transcripts = Transcripts::collect(messages, analyses, turns)?;
        Ok(rows
            .into_iter()
            .map(|row| transcripts.snapshot(row))
            .collect::<Result<_, _>>()?)
    }
}

/// 세션들이 출처인 기억(memory_optouts → memory_notes → pets), 턴 분석, 메시지, 턴, 세션 행을 이 트랜잭션에서 지운다.
/// 기억 테이블의 FK 연쇄가 같은 일을 하지만 여기서도 명시한다. 다른 세션의 사실이 지운 아이나 사실을 가리키면 FK 가
/// 그 칸만 비운다. 지운 세션 행 수를 돌려준다.
async fn cascade(tx: &mut Transaction<'_, Postgres>, ids: &[String]) -> Result<u64, sqlx::Error> {
    if ids.is_empty() {
        return Ok(0);
    }
    for statement in [
        "DELETE FROM memory_optouts WHERE session_id = ANY($1)",
        "DELETE FROM memory_notes WHERE session_id = ANY($1)",
        "DELETE FROM pets WHERE source_session_id = ANY($1)",
        "DELETE FROM turn_analyses WHERE session_id = ANY($1)",
        "DELETE FROM messages WHERE session_id = ANY($1)",
        "DELETE FROM turns WHERE session_id = ANY($1)",
    ] {
        sqlx::query(statement).bind(ids).execute(&mut **tx).await?;
    }
    let sessions = sqlx::query("DELETE FROM sessions WHERE id = ANY($1)")
        .bind(ids)
        .execute(&mut **tx)
        .await?;
    Ok(sessions.rows_affected())
}

/// 턴을 id 로 upsert 한다. 이미 있는 턴은 상태·끝 시각·오류 종류만 덮고 시작 시각은 처음 값이 남는다.
/// 다른 세션의 턴과 id 가 겹치면 그 행은 갱신되지 않으므로 쓴 행 수가 모자라고, `TurnIdTaken` 이다.
async fn save_turns(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    columns: TurnColumns<'_>,
) -> Result<(), StoreError> {
    if columns.id.is_empty() {
        return Ok(());
    }
    let written = sqlx::query(
        "INSERT INTO turns (id, session_id, status, started_at, finished_at, error_kind) \
         SELECT id, $1, status, started_at, finished_at, error_kind \
         FROM UNNEST($2::varchar[], $3::varchar[], $4::timestamptz[], $5::timestamptz[], \
                     $6::varchar[]) AS t(id, status, started_at, finished_at, error_kind) \
         ON CONFLICT (id) DO UPDATE SET \
           status = EXCLUDED.status, finished_at = EXCLUDED.finished_at, \
           error_kind = EXCLUDED.error_kind \
         WHERE turns.session_id = EXCLUDED.session_id",
    )
    .bind(session_id)
    .bind(&columns.id)
    .bind(&columns.status)
    .bind(&columns.started_at)
    .bind(&columns.finished_at)
    .bind(&columns.error_kind)
    .execute(&mut **tx)
    .await?;
    if written.rows_affected() != columns.id.len() as u64 {
        // 떨어뜨린 트랜잭션은 되돌려진다.
        return Err(StoreError::TurnIdTaken);
    }
    Ok(())
}

/// 메시지를 순번으로 upsert 하고, 새 전사보다 뒤의 순번(줄어든 전사의 옛 꼬리)을 지운다.
async fn save_messages(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    columns: MessageColumns<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM messages WHERE session_id = $1 AND seq >= $2")
        .bind(session_id)
        .bind(columns.length())
        .execute(&mut **tx)
        .await?;
    if columns.seq.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO messages (session_id, seq, role, text, task, at, turn_id) \
         SELECT $1, * FROM UNNEST($2::int4[], $3::varchar[], $4::text[], $5::int4[], \
                                  $6::timestamptz[], $7::varchar[]) \
         ON CONFLICT (session_id, seq) DO UPDATE SET \
           role = EXCLUDED.role, text = EXCLUDED.text, task = EXCLUDED.task, at = EXCLUDED.at, \
           turn_id = EXCLUDED.turn_id",
    )
    .bind(session_id)
    .bind(&columns.seq)
    .bind(&columns.role)
    .bind(&columns.text)
    .bind(&columns.task)
    .bind(&columns.at)
    .bind(&columns.turn_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn save_analyses(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    columns: AnalysisColumns,
) -> Result<(), sqlx::Error> {
    if columns.seq.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO turn_analyses (session_id, seq, at, task, phase, risk_level, risk_detected_by, \
                                    from_task, to_task, advanced, retry_count, knowledge, supervision, \
                                    reply_label, reply_label_probability, reply_judge, trace) \
         SELECT $1, seq, at, task, phase, risk_level, risk_detected_by, from_task, to_task, \
                advanced, retry_count, knowledge::jsonb, supervision::jsonb, \
                reply_label, reply_label_probability, reply_judge, trace::jsonb \
         FROM UNNEST($2::int4[], $3::timestamptz[], $4::int4[], $5::varchar[], $6::int4[], \
                     $7::varchar[], $8::int4[], $9::int4[], $10::bool[], $11::int4[], \
                     $12::text[], $13::text[], $14::varchar[], $15::float4[], $16::varchar[], \
                     $17::text[]) \
           AS t(seq, at, task, phase, risk_level, risk_detected_by, from_task, to_task, \
                advanced, retry_count, knowledge, supervision, \
                reply_label, reply_label_probability, reply_judge, trace) \
         ON CONFLICT (session_id, seq) DO UPDATE SET \
           at = EXCLUDED.at, task = EXCLUDED.task, phase = EXCLUDED.phase, \
           risk_level = EXCLUDED.risk_level, risk_detected_by = EXCLUDED.risk_detected_by, \
           from_task = EXCLUDED.from_task, to_task = EXCLUDED.to_task, \
           advanced = EXCLUDED.advanced, retry_count = EXCLUDED.retry_count, \
           knowledge = EXCLUDED.knowledge, supervision = EXCLUDED.supervision, \
           reply_label = EXCLUDED.reply_label, \
           reply_label_probability = EXCLUDED.reply_label_probability, \
           reply_judge = EXCLUDED.reply_judge, trace = EXCLUDED.trace",
    )
    .bind(session_id)
    .bind(&columns.seq)
    .bind(&columns.at)
    .bind(&columns.task)
    .bind(&columns.phase)
    .bind(&columns.risk_level)
    .bind(&columns.risk_detected_by)
    .bind(&columns.from_task)
    .bind(&columns.to_task)
    .bind(&columns.advanced)
    .bind(&columns.retry_count)
    .bind(&columns.knowledge)
    .bind(&columns.supervision)
    .bind(&columns.reply_label)
    .bind(&columns.reply_label_probability)
    .bind(&columns.reply_judge)
    .bind(&columns.trace)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests;
