//! 흐름이 바깥에 묻는 trait: 세션 저장, 계정의 대화 언어, 시계. 구현은 `adapters` 와 테스트 더블이 끼운다.
//!
//! 오류는 HTTP 겉의 `ApiError` 로 받는다. 저장의 원인(SQL 오류)은 구현이 로그에 남기고 종류만 올린다.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::{DateTime, Utc};
use futures_util::future::BoxFuture;

use crate::identity::ChatLanguage;
use crate::shared::ApiError;
use crate::support::session::{MessageActivity, SessionSnapshot};
use crate::support::store::{DeletedSession, TrashPurge};

/// 재개가 잇는 직전 세션과 그 마지막 활동 시각. 경과 일수는 부르는 쪽이 이 시각에서 구한다(저장하지 않는다).
#[derive(Debug, Clone, PartialEq)]
pub struct LatestSession {
    pub snapshot: SessionSnapshot,
    /// 그 세션의 마지막 메시지 시각(`messages` 의 `max(at)`), 메시지가 없으면 세션 시작 시각. 저장의 SQL 이 구한다.
    pub last_active_at: DateTime<Utc>,
}

/// 세션을 읽고 쓰는 곳.
pub trait SessionRepository {
    /// 넣거나 갱신한다. 같은 id 가 다른 소유자의 것이면 `403`.
    fn save<'a>(&'a self, snapshot: &'a SessionSnapshot) -> BoxFuture<'a, Result<(), ApiError>>;
    fn find<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<Option<SessionSnapshot>, ApiError>>;
    /// 소유자의 세션을 시작이 늦은 것부터 `limit` 개까지.
    fn find_by_owner<'a>(
        &'a self,
        owner_id: &'a str,
        limit: u32,
    ) -> BoxFuture<'a, Result<Vec<SessionSnapshot>, ApiError>>;
    /// 소유자의 직전 세션: 마지막 메시지 시각(메시지가 없으면 세션 시작 시각)이 가장 늦은 세션과 그 시각. 없으면 `None`.
    fn latest_by_owner<'a>(
        &'a self,
        owner_id: &'a str,
    ) -> BoxFuture<'a, Result<Option<LatestSession>, ApiError>>;
    /// 세션들의 메시지 집계. 메시지가 없는 세션은 빠진다(부르는 쪽이 `Default` 로 본다).
    fn message_activity<'a>(
        &'a self,
        session_ids: &'a [&'a str],
    ) -> BoxFuture<'a, Result<HashMap<String, MessageActivity>, ApiError>>;
    /// 전사, 턴 분석, 리포트를 함께 지운다(하드 삭제). 사용자의 삭제는 `soft_delete` 다.
    fn delete<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<(), ApiError>>;

    // 아래는 소프트 삭제와 파기(ADR-0036). 기본 구현은 `501` 이고 저장의 구현과 테스트 더블이 덮는다.
    // `find`·`find_by_owner`·`latest_by_owner` 는 지운 세션을 보지 않는다. 지운 세션을 보는 것은 `find_deleted`·`list_deleted` 뿐이다.

    /// 세션을 지운 것으로 적는다. 이미 지웠으면 그대로(멱등). 세션 행이 없으면 `false`.
    fn soft_delete<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        let _ = id;
        not_implemented()
    }
    /// 지운 세션을 되살린다. 살아 있으면 그대로. 세션 행이 없으면 `false`.
    fn restore<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        let _ = id;
        not_implemented()
    }
    /// 지운 세션 하나(소유자 확인용). 살아 있거나 없으면 `None`.
    fn find_deleted<'a>(
        &'a self,
        id: &'a str,
    ) -> BoxFuture<'a, Result<Option<SessionSnapshot>, ApiError>> {
        let _ = id;
        not_implemented()
    }
    /// 소유자의 보관함: 늦게 지운 것부터 `limit` 개까지, 지운 시각과 파기 시각과 함께.
    fn list_deleted<'a>(
        &'a self,
        owner_id: &'a str,
        limit: u32,
    ) -> BoxFuture<'a, Result<Vec<DeletedSession>, ApiError>> {
        let _ = (owner_id, limit);
        not_implemented()
    }
    /// 살아 있는 세션의 리포트를 지운 것으로 적는다(칸은 남는다). 지울 리포트가 없었으면(없거나 이미 지웠으면) `false`.
    fn delete_report<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        let _ = id;
        not_implemented()
    }
    /// 지운 리포트를 되살린다. 되살릴 리포트가 없었으면 `false`.
    fn restore_report<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        let _ = id;
        not_implemented()
    }
    /// 세션들 중 리포트가 있으나 지운 상태인 것의 id. 지운 리포트는 `find` 의 스냅샷에서 `report: None` 으로 보인다.
    fn deleted_reports<'a>(
        &'a self,
        session_ids: &'a [&'a str],
    ) -> BoxFuture<'a, Result<HashSet<String>, ApiError>> {
        let _ = session_ids;
        not_implemented()
    }
    /// 기동 때의 파기: `at` 에서 보관 기간보다 오래 전에 지운 리포트의 칸을 비우고 세션을 연쇄로 지운다.
    fn purge_trash<'a>(&'a self, at: DateTime<Utc>) -> BoxFuture<'a, Result<TrashPurge, ApiError>> {
        let _ = at;
        not_implemented()
    }
    /// 소유자의 세션(지운 것 포함)과 기억을 연쇄로 지운다. 계정 행은 두고 지운 세션 수를 돌려준다.
    fn delete_by_owner<'a>(&'a self, owner_id: &'a str) -> BoxFuture<'a, Result<u64, ApiError>> {
        let _ = owner_id;
        not_implemented()
    }
}

/// 아직 구현을 끼우지 않은 저장 메서드의 기본 응답(`501`).
fn not_implemented<'a, T: Send + 'a>() -> BoxFuture<'a, Result<T, ApiError>> {
    Box::pin(async { Err(ApiError::NotImplemented) })
}

/// 계정에 정해 둔 대화 언어. 계정이 없거나 정하지 않았으면 `None`.
pub trait ChatLanguages {
    fn chat_language<'a>(
        &'a self,
        account_id: &'a str,
    ) -> BoxFuture<'a, Result<Option<ChatLanguage>, ApiError>>;
}

pub trait Clock {
    fn now(&self) -> DateTime<Utc>;
}

pub type SharedSessionRepository = Arc<dyn SessionRepository + Send + Sync>;
pub type SharedChatLanguages = Arc<dyn ChatLanguages + Send + Sync>;
pub type SharedClock = Arc<dyn Clock + Send + Sync>;
