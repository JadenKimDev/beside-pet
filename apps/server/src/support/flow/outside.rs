//! 흐름이 바깥에 묻는 trait: 세션 저장, 계정의 대화 언어, 시계. 구현은 `adapters` 와 테스트 더블이 끼운다.
//!
//! 오류는 HTTP 겉의 `ApiError` 로 받는다. 저장의 원인(SQL 오류)은 구현이 로그에 남기고 종류만 올린다.

use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use futures_util::future::BoxFuture;

use crate::identity::ChatLanguage;
use crate::shared::ApiError;
use crate::support::session::{MessageActivity, SessionSnapshot};

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
    /// 전사, 턴 분석, 리포트를 함께 지운다.
    fn delete<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<(), ApiError>>;
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
