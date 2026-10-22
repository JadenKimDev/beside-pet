//! 기억을 읽고 쓰는 곳의 trait. 구현(Postgres)은 `support/store` 가 두고 `app.rs` 가 끼운다.
//!
//! 오류는 HTTP 겉의 `ApiError` 로 받는다. 원인(SQL 오류)은 구현이 본문 없이 로그에 남기고 종류만 올린다.

use std::sync::Arc;

use chrono::{DateTime, Utc};
use futures_util::future::BoxFuture;

use super::{MemoryNote, MemoryView, NewNote, NewPet, Pet};
use crate::shared::ApiError;

/// "기억하지 마" 사건 하나(`memory_optouts`). 내용은 없다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MemoryOptout {
    pub owner_id: String,
    pub session_id: String,
    pub seq: i32,
    pub at: DateTime<Utc>,
}

pub trait MemoryStore {
    /// 소유자의 아이들과 지금 유효한 사실(`current_memory`, 최근 말한 순).
    fn view<'a>(&'a self, owner_id: &'a str) -> BoxFuture<'a, Result<MemoryView, ApiError>>;

    /// 아이를 넣는다. 같은 소유자에 같은 이름이 이미 있으면 새로 넣지 않고 그 행을 돌려준다.
    fn upsert_pet<'a>(&'a self, pet: &'a NewPet) -> BoxFuture<'a, Result<Pet, ApiError>>;

    /// 사실을 넣고, `supersedes` 의 옛 사실들의 `superseded_by` 를 새 행으로 잇는다. 한 트랜잭션이다.
    fn insert_note<'a>(
        &'a self,
        note: &'a NewNote,
        supersedes: &'a [String],
    ) -> BoxFuture<'a, Result<MemoryNote, ApiError>>;

    /// 옵트아웃 사건을 남긴다. 같은 (세션, seq) 가 이미 있으면 그대로 둔다.
    fn record_optout<'a>(&'a self, optout: &'a MemoryOptout)
    -> BoxFuture<'a, Result<(), ApiError>>;
}

pub type SharedMemoryStore = Arc<dyn MemoryStore + Send + Sync>;
