//! 보관함: 세션과 리포트의 소프트 삭제(`deleted_at`, `report_deleted_at` 만 적는다)와 되살리기, 지운 것을 읽는 SQL.
//!
//! 행과 메시지와 기억 행은 손대지 않는다. 지운 세션은 다른 읽기에서 없음이고, 여기의 읽기만 그것을 본다.
//! 파기 예정 시각은 저장하지 않고 `deleted_at` 에서 쿼리로 구한다(ADR-0036).

use std::collections::HashSet;

use chrono::{DateTime, Utc};
use sqlx::AssertSqlSafe;

use super::super::session::SessionSnapshot;
use super::purge::retention_months;
use super::{SESSION_COLUMNS, SessionStore, StoreError};

/// 보관함의 한 항목: 지운 세션과 지운 시각, 파기될 시각(`deleted_at + TRASH_RETENTION_MONTHS`).
#[derive(Debug, Clone, PartialEq)]
pub struct DeletedSession {
    pub snapshot: SessionSnapshot,
    pub deleted_at: DateTime<Utc>,
    pub purge_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct DeletionRow {
    id: String,
    deleted_at: DateTime<Utc>,
    purge_at: DateTime<Utc>,
}

impl SessionStore {
    /// 세션을 지운 것으로 적는다. 이미 지웠으면 처음 시각을 둔다(멱등). 그 id 의 세션 행이 있으면 `true`.
    pub async fn soft_delete(&self, id: &str) -> Result<bool, StoreError> {
        let written = sqlx::query(
            "UPDATE sessions SET deleted_at = coalesce(deleted_at, now()) WHERE id = $1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(written.rows_affected() > 0)
    }

    /// 지운 세션을 되살린다(`deleted_at` 을 비운다). 살아 있는 세션은 그대로다. 그 id 의 세션 행이 있으면 `true`.
    pub async fn restore(&self, id: &str) -> Result<bool, StoreError> {
        let written = sqlx::query("UPDATE sessions SET deleted_at = NULL WHERE id = $1")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(written.rows_affected() > 0)
    }

    /// 지운 세션 하나. 살아 있거나 없으면 `None`. 되살리기와 멱등 삭제가 소유자를 확인하는 데 쓴다.
    pub async fn find_deleted(&self, id: &str) -> Result<Option<SessionSnapshot>, StoreError> {
        let mut snapshots = self
            .read(
                AssertSqlSafe(format!(
                    "SELECT {SESSION_COLUMNS} FROM sessions WHERE id = $1 AND deleted_at IS NOT NULL"
                )),
                id,
                None,
            )
            .await?;
        Ok(snapshots.pop())
    }

    /// 소유자의 보관함: 지운 세션을 늦게 지운 것부터 `limit` 개까지.
    pub async fn list_deleted(
        &self,
        owner_id: &str,
        limit: u32,
    ) -> Result<Vec<DeletedSession>, StoreError> {
        let deletions: Vec<DeletionRow> = sqlx::query_as(
            "SELECT id, deleted_at, deleted_at + make_interval(months => $3) AS purge_at \
             FROM sessions WHERE owner_id = $1 AND deleted_at IS NOT NULL \
             ORDER BY deleted_at DESC, id DESC LIMIT $2",
        )
        .bind(owner_id)
        .bind(i64::from(limit))
        .bind(retention_months())
        .fetch_all(&self.pool)
        .await?;
        let snapshots = self
            .read(
                AssertSqlSafe(format!(
                    "SELECT {SESSION_COLUMNS} FROM sessions WHERE owner_id = $1 \
                     AND deleted_at IS NOT NULL ORDER BY deleted_at DESC, id DESC LIMIT $2"
                )),
                owner_id,
                Some(i64::from(limit)),
            )
            .await?;
        // 두 읽기 사이에 되살렸거나 지운 세션은 두 쪽에 다 있는 것만 낸다.
        Ok(deletions
            .into_iter()
            .filter_map(|row| {
                let snapshot = snapshots.iter().find(|snapshot| snapshot.id == row.id)?;
                Some(DeletedSession {
                    snapshot: snapshot.clone(),
                    deleted_at: row.deleted_at,
                    purge_at: row.purge_at,
                })
            })
            .collect())
    }

    /// 살아 있는 세션의 리포트를 지운 것으로 적는다. 칸은 남긴다. 지울 리포트(있고 아직 안 지운 것)가 있었으면 `true`.
    pub async fn delete_report(&self, id: &str) -> Result<bool, StoreError> {
        let written = sqlx::query(
            "UPDATE sessions SET report_deleted_at = now() \
             WHERE id = $1 AND deleted_at IS NULL AND report IS NOT NULL AND report_deleted_at IS NULL",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(written.rows_affected() > 0)
    }

    /// 살아 있는 세션의 지운 리포트를 되살린다. 되살린 리포트가 있었으면 `true`.
    pub async fn restore_report(&self, id: &str) -> Result<bool, StoreError> {
        let written = sqlx::query(
            "UPDATE sessions SET report_deleted_at = NULL \
             WHERE id = $1 AND deleted_at IS NULL AND report IS NOT NULL \
               AND report_deleted_at IS NOT NULL",
        )
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(written.rows_affected() > 0)
    }

    /// 세션들 중 리포트가 있으나 지운 상태인 것의 id. 목록의 `reportDeleted` 와 리포트를 다시 만들지 않는 판단이 쓴다.
    pub async fn deleted_reports(
        &self,
        session_ids: &[&str],
    ) -> Result<HashSet<String>, StoreError> {
        if session_ids.is_empty() {
            return Ok(HashSet::new());
        }
        let ids: Vec<(String,)> = sqlx::query_as(
            "SELECT id FROM sessions WHERE id = ANY($1) \
               AND report IS NOT NULL AND report_deleted_at IS NOT NULL",
        )
        .bind(session_ids)
        .fetch_all(&self.pool)
        .await?;
        Ok(ids.into_iter().map(|(id,)| id).collect())
    }
}
