//! 바깥 trait 의 실제 구현: `SessionStore` 를 저장으로, `PgMemoryStore` 를 기억으로, `identity` 의 계정 서비스를 대화 언어로,
//! 시스템 시계. 기동 파기의 순서(`purge_on_startup`)도 여기서 저장과 identity 를 잇는다.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use futures_util::future::BoxFuture;

use super::access::NOT_OWNER;
use super::outside::{ChatLanguages, Clock, LatestSession, SessionRepository};
use crate::identity::{
    AccountActivity, ChatLanguage, OwnedDataPurger, SessionPresence, SharedAccountService,
    SharedOwnedDataPurger, SharedSessionPresence, SuspendedAccounts,
};
use crate::shared::ApiError;
use crate::support::memory::{
    MemoryNote, MemoryOptout, MemoryStore, MemoryView, NewNote, NewPet, Pet, SharedMemoryStore,
};
use crate::support::session::{MessageActivity, SessionSnapshot};
use crate::support::store::{
    DeletedSession, PgMemoryStore, SessionStore, StoreError, TRASH_RETENTION_MONTHS, TrashPurge,
};

/// 저장의 실패를 HTTP 겉으로 옮긴다. 원인은 종류만 로그에 남긴다(본문과 식별 정보는 싣지 않는다).
fn store_error(error: StoreError) -> ApiError {
    match error {
        StoreError::OwnerMismatch => ApiError::Forbidden(NOT_OWNER.to_owned()),
        StoreError::TurnIdTaken => ApiError::Conflict("Turn already received".to_owned()),
        StoreError::Database(error) => {
            tracing::error!(kind = database_error_kind(&error), "session store failed");
            ApiError::Internal
        }
    }
}

/// SQL 오류의 종류. 메시지(값이 섞일 수 있다)는 싣지 않는다.
fn database_error_kind(error: &sqlx::Error) -> &'static str {
    match error {
        sqlx::Error::Database(_) => "database",
        sqlx::Error::PoolTimedOut | sqlx::Error::PoolClosed => "pool",
        sqlx::Error::Io(_) | sqlx::Error::Tls(_) => "connection",
        sqlx::Error::RowNotFound | sqlx::Error::ColumnNotFound(_) => "row",
        sqlx::Error::ColumnDecode { .. } | sqlx::Error::Decode(_) => "decode",
        _ => "other",
    }
}

impl SessionRepository for SessionStore {
    fn save<'a>(&'a self, snapshot: &'a SessionSnapshot) -> BoxFuture<'a, Result<(), ApiError>> {
        Box::pin(async move {
            SessionStore::save(self, snapshot)
                .await
                .map_err(store_error)
        })
    }

    fn find<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<Option<SessionSnapshot>, ApiError>> {
        Box::pin(async move { SessionStore::find(self, id).await.map_err(store_error) })
    }

    fn find_by_owner<'a>(
        &'a self,
        owner_id: &'a str,
        limit: u32,
    ) -> BoxFuture<'a, Result<Vec<SessionSnapshot>, ApiError>> {
        Box::pin(async move {
            SessionStore::find_by_owner(self, owner_id, limit)
                .await
                .map_err(store_error)
        })
    }

    fn latest_by_owner<'a>(
        &'a self,
        owner_id: &'a str,
    ) -> BoxFuture<'a, Result<Option<LatestSession>, ApiError>> {
        Box::pin(async move {
            let latest = SessionStore::latest_by_owner(self, owner_id)
                .await
                .map_err(store_error)?;
            Ok(latest.map(|(snapshot, last_active_at)| LatestSession {
                snapshot,
                last_active_at,
            }))
        })
    }

    fn message_activity<'a>(
        &'a self,
        session_ids: &'a [&'a str],
    ) -> BoxFuture<'a, Result<HashMap<String, MessageActivity>, ApiError>> {
        Box::pin(async move {
            SessionStore::message_activity(self, session_ids)
                .await
                .map_err(store_error)
        })
    }

    fn delete<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<(), ApiError>> {
        Box::pin(async move { SessionStore::delete(self, id).await.map_err(store_error) })
    }

    fn soft_delete<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        Box::pin(async move {
            SessionStore::soft_delete(self, id)
                .await
                .map_err(store_error)
        })
    }

    fn restore<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        Box::pin(async move { SessionStore::restore(self, id).await.map_err(store_error) })
    }

    fn find_deleted<'a>(
        &'a self,
        id: &'a str,
    ) -> BoxFuture<'a, Result<Option<SessionSnapshot>, ApiError>> {
        Box::pin(async move {
            SessionStore::find_deleted(self, id)
                .await
                .map_err(store_error)
        })
    }

    fn list_deleted<'a>(
        &'a self,
        owner_id: &'a str,
        limit: u32,
    ) -> BoxFuture<'a, Result<Vec<DeletedSession>, ApiError>> {
        Box::pin(async move {
            SessionStore::list_deleted(self, owner_id, limit)
                .await
                .map_err(store_error)
        })
    }

    fn delete_report<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        Box::pin(async move {
            SessionStore::delete_report(self, id)
                .await
                .map_err(store_error)
        })
    }

    fn restore_report<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        Box::pin(async move {
            SessionStore::restore_report(self, id)
                .await
                .map_err(store_error)
        })
    }

    fn deleted_reports<'a>(
        &'a self,
        session_ids: &'a [&'a str],
    ) -> BoxFuture<'a, Result<HashSet<String>, ApiError>> {
        Box::pin(async move {
            SessionStore::deleted_reports(self, session_ids)
                .await
                .map_err(store_error)
        })
    }

    fn purge_trash<'a>(&'a self, at: DateTime<Utc>) -> BoxFuture<'a, Result<TrashPurge, ApiError>> {
        Box::pin(async move {
            SessionStore::purge_trash(self, at)
                .await
                .map_err(store_error)
        })
    }

    fn delete_by_owner<'a>(&'a self, owner_id: &'a str) -> BoxFuture<'a, Result<u64, ApiError>> {
        Box::pin(async move {
            SessionStore::delete_by_owner(self, owner_id)
                .await
                .map_err(store_error)
        })
    }
}

/// 계정을 완전히 지울 때 identity 가 묻는 대화·기억 지우기: 세션 저장의 주인별 연쇄(`delete_by_owner`)다.
pub struct OwnedSessions<R>(pub R);

impl<R: SessionRepository + Send + Sync> OwnedDataPurger for OwnedSessions<R> {
    fn delete_owned_by<'a>(&'a self, owner_id: &'a str) -> BoxFuture<'a, Result<u64, ApiError>> {
        self.0.delete_by_owner(owner_id)
    }
}

/// `identity` 의 계정 완전 삭제에 끼울 대화·기억 지우기의 구현(Postgres 저장).
pub fn owned_data_purger(db: sqlx::PgPool) -> SharedOwnedDataPurger {
    Arc::new(OwnedSessions(SessionStore::new(db)))
}

/// 기동 파기 한 번이 지운 행 수. 식별자와 본문은 담지 않는다.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct StartupPurge {
    /// 칸을 비운 지운 리포트.
    pub reports: u64,
    /// 보관 기간이 지나 연쇄로 지운 지운 세션.
    pub sessions: u64,
    /// 정지 보관 기간이 지나 행을 지운 계정.
    pub accounts: u64,
    /// 그 계정들과 함께 연쇄로 지운 세션.
    pub account_sessions: u64,
    /// 보존 기간이 지나 지운 기억 행(아이, 사실, 옵트아웃).
    pub memory: u64,
}

/// 기동 때의 파기(ADR-0036, ADR-0034). 순서는 (1) 보관 기간이 지난 지운 리포트 비우기와 (2) 지운 세션 연쇄,
/// (3) 정지 보관 기간이 지난 계정마다 대화·기억 연쇄 뒤 계정 행 삭제, (4) 기억 보존 기간 파기다.
/// 처음 실패한 단계에서 멈추고 남은 것은 다음 기동이 지운다.
pub async fn purge_on_startup(
    db: sqlx::PgPool,
    accounts: &(dyn SuspendedAccounts + Send + Sync),
    at: DateTime<Utc>,
) -> Result<StartupPurge, ApiError> {
    let sessions = SessionStore::new(db.clone());
    let trash = SessionRepository::purge_trash(&sessions, at).await?;
    let mut purge = StartupPurge {
        reports: trash.reports,
        sessions: trash.sessions,
        ..StartupPurge::default()
    };
    for id in accounts
        .suspended_before(at, TRASH_RETENTION_MONTHS)
        .await?
    {
        purge.account_sessions += SessionRepository::delete_by_owner(&sessions, &id).await?;
        if accounts.delete_account_row(&id).await? {
            purge.accounts += 1;
        }
    }
    purge.memory = purge_stale_memory(db, at).await?;
    Ok(purge)
}

/// `/v1/auth/me` 의 `hasProfile` 과 관리자 계정 목록의 계정별 활동.
impl SessionPresence for SessionStore {
    fn has_sessions<'a>(&'a self, account_id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        Box::pin(async move {
            SessionStore::has_sessions(self, account_id)
                .await
                .map_err(store_error)
        })
    }

    fn activity_by_account<'a>(
        &'a self,
        account_ids: &'a [String],
    ) -> BoxFuture<'a, Result<HashMap<String, AccountActivity>, ApiError>> {
        Box::pin(async move {
            SessionStore::activity_by_owner(self, account_ids)
                .await
                .map_err(store_error)
        })
    }
}

/// 기동 때 정리: 앞 프로세스가 끝내지 못한 `pending` 턴을 `failed`(`restart`)로 닫고 바꾼 행 수를 돌려준다.
pub async fn fail_pending_turns(db: sqlx::PgPool, at: DateTime<Utc>) -> Result<u64, ApiError> {
    SessionStore::new(db)
        .fail_pending_turns(at)
        .await
        .map_err(store_error)
}

impl MemoryStore for PgMemoryStore {
    fn view<'a>(&'a self, owner_id: &'a str) -> BoxFuture<'a, Result<MemoryView, ApiError>> {
        Box::pin(async move {
            PgMemoryStore::view(self, owner_id)
                .await
                .map_err(store_error)
        })
    }

    fn upsert_pet<'a>(&'a self, pet: &'a NewPet) -> BoxFuture<'a, Result<Pet, ApiError>> {
        Box::pin(async move {
            PgMemoryStore::upsert_pet(self, pet)
                .await
                .map_err(store_error)
        })
    }

    fn insert_note<'a>(
        &'a self,
        note: &'a NewNote,
        supersedes: &'a [String],
    ) -> BoxFuture<'a, Result<MemoryNote, ApiError>> {
        Box::pin(async move {
            PgMemoryStore::insert_note(self, note, supersedes)
                .await
                .map_err(store_error)
        })
    }

    fn record_optout<'a>(
        &'a self,
        optout: &'a MemoryOptout,
    ) -> BoxFuture<'a, Result<(), ApiError>> {
        Box::pin(async move {
            PgMemoryStore::record_optout(self, optout)
                .await
                .map_err(store_error)
        })
    }
}

/// 흐름에 끼울 기억 저장의 구현(Postgres).
pub fn memory_store(db: sqlx::PgPool) -> SharedMemoryStore {
    Arc::new(PgMemoryStore::new(db))
}

/// 기동 파기의 마지막 단계: 마지막 대화가 보존 기간(`MEMORY_RETENTION_MONTHS`)보다 오래된 계정의 기억(아이, 사실, 옵트아웃)을
/// 지우고 지운 행 수를 돌려준다. 세션은 지우지 않는다.
async fn purge_stale_memory(db: sqlx::PgPool, at: DateTime<Utc>) -> Result<u64, ApiError> {
    PgMemoryStore::new(db)
        .purge_expired(at)
        .await
        .map_err(store_error)
}

/// `identity` 에 끼울 세션 유무의 구현(Postgres 저장).
pub fn session_presence(db: sqlx::PgPool) -> SharedSessionPresence {
    Arc::new(SessionStore::new(db))
}

/// `identity` 의 계정 서비스에서 대화 언어를 읽는다. 없는 계정(`404`)은 TS 처럼 언어 없음으로 본다.
pub struct AccountLanguages(pub SharedAccountService);

impl ChatLanguages for AccountLanguages {
    fn chat_language<'a>(
        &'a self,
        account_id: &'a str,
    ) -> BoxFuture<'a, Result<Option<ChatLanguage>, ApiError>> {
        Box::pin(async move {
            match self.0.me(account_id.to_owned()).await {
                Ok(account) => Ok(account.chat_language),
                Err(ApiError::NotFound(_)) => Ok(None),
                Err(error) => Err(error),
            }
        })
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now(&self) -> DateTime<Utc> {
        Utc::now()
    }
}

#[cfg(test)]
mod tests;
