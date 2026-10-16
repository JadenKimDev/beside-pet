//! 대화 저장: `sessions`·`messages`·`turn_analyses` 의 SQL.
//!
//! 스냅샷 하나는 세션 행 하나, 메시지 행(순번 = 전사의 자리), 턴 분석 행(순번 = 분석의 자리)이다. 저장은 한 트랜잭션의
//! upsert 라 두 번 해도 같다. 계획·요약·진행률은 규칙으로 다시 구하므로 저장하지 않는다. 삭제는 한 트랜잭션으로
//! turn_analyses → messages → sessions 순서로 지운다(ADR-0006). 시각은 timestamptz 라 마이크로초까지 남는다.

use std::fmt;

use sqlx::{AssertSqlSafe, PgPool, Postgres, Transaction};

use super::session::SessionSnapshot;
use codec::{count_number, level_number, task_number, to_document};
use rows::{AnalysisColumns, AnalysisRow, MessageColumns, MessageRow, SessionRow, Transcripts};

mod codec;
mod rows;

const SESSION_COLUMNS: &str = "id, owner_id, task, retry_count, support_level, closed, \
                               grief_profile::text AS grief_profile, report::text AS report, created_at";

/// 저장의 오류. 문구에 본문과 식별 정보를 싣지 않는다.
#[derive(Debug)]
pub enum StoreError {
    Database(sqlx::Error),
    /// 같은 id 의 세션이 다른 소유자의 것이다. 아무것도 쓰지 않았다.
    OwnerMismatch,
}

impl fmt::Display for StoreError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            StoreError::Database(error) => write!(f, "session store: {error}"),
            StoreError::OwnerMismatch => f.write_str("session belongs to another owner"),
        }
    }
}

impl std::error::Error for StoreError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            StoreError::Database(error) => Some(error),
            StoreError::OwnerMismatch => None,
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

    /// 세션 행을 넣거나 갱신하고, 메시지와 턴 분석을 순번으로 upsert 한다. 한 트랜잭션이다.
    /// 소유자와 시작 시각은 처음 쓴 값이 남는다. 같은 id 가 다른 소유자의 것이면 `OwnerMismatch` 이고 아무것도 쓰지 않는다.
    pub async fn save(&self, snapshot: &SessionSnapshot) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        let written = sqlx::query(
            "INSERT INTO sessions (id, owner_id, task, retry_count, support_level, closed, \
                                   grief_profile, report, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, now()) \
             ON CONFLICT (id) DO UPDATE SET \
               task = EXCLUDED.task, retry_count = EXCLUDED.retry_count, \
               support_level = EXCLUDED.support_level, closed = EXCLUDED.closed, \
               grief_profile = EXCLUDED.grief_profile, report = EXCLUDED.report, \
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

    pub async fn find(&self, id: &str) -> Result<Option<SessionSnapshot>, StoreError> {
        let mut snapshots = self
            .read(
                AssertSqlSafe(format!(
                    "SELECT {SESSION_COLUMNS} FROM sessions WHERE id = $1"
                )),
                id,
                None,
            )
            .await?;
        Ok(snapshots.pop())
    }

    /// 소유자의 세션을 시작이 늦은 것부터 `limit` 개까지.
    pub async fn find_by_owner(
        &self,
        owner_id: &str,
        limit: u32,
    ) -> Result<Vec<SessionSnapshot>, StoreError> {
        self.read(
            AssertSqlSafe(format!(
                "SELECT {SESSION_COLUMNS} FROM sessions WHERE owner_id = $1 \
                 ORDER BY created_at DESC, id DESC LIMIT $2"
            )),
            owner_id,
            Some(i64::from(limit)),
        )
        .await
    }

    /// 그 세션의 턴 분석, 메시지, 세션 행을 한 트랜잭션으로 지운다. 없는 id 는 아무것도 하지 않는다.
    pub async fn delete(&self, id: &str) -> Result<(), StoreError> {
        let mut tx = self.pool.begin().await?;
        for statement in [
            "DELETE FROM turn_analyses WHERE session_id = $1",
            "DELETE FROM messages WHERE session_id = $1",
            "DELETE FROM sessions WHERE id = $1",
        ] {
            sqlx::query(statement).bind(id).execute(&mut *tx).await?;
        }
        tx.commit().await?;
        Ok(())
    }

    /// 세션 행을 고르고 그 메시지와 분석을 붙인다. 세 읽기가 같은 시점을 보도록 한 스냅샷 트랜잭션에서 읽는다.
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
            "SELECT session_id, role, text, task, at FROM messages \
             WHERE session_id = ANY($1) ORDER BY session_id, seq",
        )
        .bind(&ids)
        .fetch_all(&mut *tx)
        .await?;
        let analyses: Vec<AnalysisRow> = sqlx::query_as(
            "SELECT session_id, at, task, phase, risk_level, risk_detected_by, from_task, to_task, \
                    advanced, retry_count, knowledge::text AS knowledge, \
                    supervision::text AS supervision \
             FROM turn_analyses WHERE session_id = ANY($1) ORDER BY session_id, seq",
        )
        .bind(&ids)
        .fetch_all(&mut *tx)
        .await?;
        tx.commit().await?;
        let mut transcripts = Transcripts::collect(messages, analyses)?;
        Ok(rows
            .into_iter()
            .map(|row| transcripts.snapshot(row))
            .collect::<Result<_, _>>()?)
    }
}

async fn save_messages(
    tx: &mut Transaction<'_, Postgres>,
    session_id: &str,
    columns: MessageColumns<'_>,
) -> Result<(), sqlx::Error> {
    if columns.seq.is_empty() {
        return Ok(());
    }
    sqlx::query(
        "INSERT INTO messages (session_id, seq, role, text, task, at) \
         SELECT $1, * FROM UNNEST($2::int4[], $3::varchar[], $4::text[], $5::int4[], \
                                  $6::timestamptz[]) \
         ON CONFLICT (session_id, seq) DO UPDATE SET \
           role = EXCLUDED.role, text = EXCLUDED.text, task = EXCLUDED.task, at = EXCLUDED.at",
    )
    .bind(session_id)
    .bind(&columns.seq)
    .bind(&columns.role)
    .bind(&columns.text)
    .bind(&columns.task)
    .bind(&columns.at)
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
                                    from_task, to_task, advanced, retry_count, knowledge, supervision) \
         SELECT $1, seq, at, task, phase, risk_level, risk_detected_by, from_task, to_task, \
                advanced, retry_count, knowledge::jsonb, supervision::jsonb \
         FROM UNNEST($2::int4[], $3::timestamptz[], $4::int4[], $5::varchar[], $6::int4[], \
                     $7::varchar[], $8::int4[], $9::int4[], $10::bool[], $11::int4[], \
                     $12::text[], $13::text[]) \
           AS t(seq, at, task, phase, risk_level, risk_detected_by, from_task, to_task, \
                advanced, retry_count, knowledge, supervision) \
         ON CONFLICT (session_id, seq) DO UPDATE SET \
           at = EXCLUDED.at, task = EXCLUDED.task, phase = EXCLUDED.phase, \
           risk_level = EXCLUDED.risk_level, risk_detected_by = EXCLUDED.risk_detected_by, \
           from_task = EXCLUDED.from_task, to_task = EXCLUDED.to_task, \
           advanced = EXCLUDED.advanced, retry_count = EXCLUDED.retry_count, \
           knowledge = EXCLUDED.knowledge, supervision = EXCLUDED.supervision",
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
    .execute(&mut **tx)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests;
