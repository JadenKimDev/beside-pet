//! 바깥 trait 의 실제 구현: `SessionStore` 를 저장으로, `PgMemoryStore` 를 기억으로, `identity` 의 계정 서비스를 대화 언어로,
//! 시스템 시계.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use futures_util::future::BoxFuture;

use super::access::NOT_OWNER;
use super::outside::{ChatLanguages, Clock, LatestSession, SessionRepository};
use crate::identity::{
    AccountActivity, ChatLanguage, SessionPresence, SharedAccountService, SharedSessionPresence,
};
use crate::shared::ApiError;
use crate::support::memory::{
    MemoryNote, MemoryOptout, MemoryStore, MemoryView, NewNote, NewPet, Pet, SharedMemoryStore,
};
use crate::support::session::{MessageActivity, SessionSnapshot};
use crate::support::store::{PgMemoryStore, SessionStore, StoreError};

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

/// 기동 때 정리: 마지막 대화가 보존 기간(`MEMORY_RETENTION_MONTHS`)보다 오래된 계정의 기억(아이, 사실, 옵트아웃)을 지우고
/// 지운 행 수를 돌려준다. 세션은 지우지 않는다.
pub async fn purge_stale_memory(db: sqlx::PgPool, at: DateTime<Utc>) -> Result<u64, ApiError> {
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
