//! 파기: 보관 기간(`TRASH_RETENTION_MONTHS`)이 지난 지운 리포트와 지운 세션의 행을 지우는 SQL, 그리고 주인별 연쇄 삭제.
//!
//! 행을 실제로 지우는 것은 기동 때의 파기와 정지 3개월이 지난 계정의 완전 삭제뿐이다(ADR-0036). 세션은 `cascade` 의
//! 연쇄로 지운다. 지운 수만 돌려주고 로그는 부르는 쪽이 남긴다.

use chrono::{DateTime, Utc};

use super::{SessionStore, StoreError, cascade};

/// 지운 대화·리포트와 정지한 계정을 두는 개월 수. 그보다 오래된 것은 기동 때 파기한다. 환경 변수로 두지 않는다.
pub const TRASH_RETENTION_MONTHS: u32 = 3;

/// SQL 의 `make_interval(months => int4)` 에 넘길 값.
pub(super) fn retention_months() -> i32 {
    i32::try_from(TRASH_RETENTION_MONTHS).unwrap_or(i32::MAX)
}

/// 한 번의 파기가 지운 수: 칸을 비운 리포트, 연쇄로 지운 세션.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct TrashPurge {
    pub reports: u64,
    pub sessions: u64,
}

impl SessionStore {
    /// `at` 에서 보관 기간보다 오래 전에 지운 리포트의 `report`·`report_deleted_at` 을 비우고, 그만큼 오래 전에 지운
    /// 세션을 연쇄로 지운다. 꼭 보관 기간인 것은 남긴다. 한 트랜잭션이다.
    pub async fn purge_trash(&self, at: DateTime<Utc>) -> Result<TrashPurge, StoreError> {
        let mut tx = self.pool.begin().await?;
        let reports = sqlx::query(
            "UPDATE sessions SET report = NULL, report_deleted_at = NULL \
             WHERE report_deleted_at < $1 - make_interval(months => $2)",
        )
        .bind(at)
        .bind(retention_months())
        .execute(&mut *tx)
        .await?
        .rows_affected();
        let expired: Vec<(String,)> = sqlx::query_as(
            "SELECT id FROM sessions WHERE deleted_at < $1 - make_interval(months => $2) FOR UPDATE",
        )
        .bind(at)
        .bind(retention_months())
        .fetch_all(&mut *tx)
        .await?;
        let ids: Vec<String> = expired.into_iter().map(|(id,)| id).collect();
        let sessions = cascade(&mut tx, &ids).await?;
        tx.commit().await?;
        Ok(TrashPurge { reports, sessions })
    }

    /// 소유자의 모든 기억(옵트아웃, 사실, 아이)과 세션(지운 것 포함)을 연쇄로 한 트랜잭션에서 지운다. 계정 행은 두고
    /// (identity 가 지운다) 지운 세션 수를 돌려준다.
    pub async fn delete_by_owner(&self, owner_id: &str) -> Result<u64, StoreError> {
        let mut tx = self.pool.begin().await?;
        for statement in [
            "DELETE FROM memory_optouts WHERE owner_id = $1",
            "DELETE FROM memory_notes WHERE owner_id = $1",
            "DELETE FROM pets WHERE owner_id = $1",
        ] {
            sqlx::query(statement)
                .bind(owner_id)
                .execute(&mut *tx)
                .await?;
        }
        let owned: Vec<(String,)> =
            sqlx::query_as("SELECT id FROM sessions WHERE owner_id = $1 FOR UPDATE")
                .bind(owner_id)
                .fetch_all(&mut *tx)
                .await?;
        let ids: Vec<String> = owned.into_iter().map(|(id,)| id).collect();
        let sessions = cascade(&mut tx, &ids).await?;
        tx.commit().await?;
        Ok(sessions)
    }
}
