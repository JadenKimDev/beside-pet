//! 대화 기능의 관문(`SupportService` trait)과 요청자, 아직 구현이 없는 `Unimplemented`.
//!
//! 핸들러는 확인한 계정을 `Requester` 로 넘기고, 소유 확인과 대화의 속은 구현이 맡는다. 구현은 `app.rs` 가 끼운다.

use std::sync::Arc;

use futures_util::future::BoxFuture;
use futures_util::stream::{self, BoxStream};

use super::{
    MessageResponse, MindReportResponse, SessionAnalysisResponse, SessionListItemResponse,
    SessionStateResponse, StartSessionRequest, StreamEvent, TurnResponse,
};
use crate::identity::{AuthenticatedAccount, Role};
use crate::shared::ApiError;

/// 요청한 계정. 관리자는 남의 세션도 볼 수 있다(TS 의 `Requester`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Requester {
    pub account_id: String,
    pub is_admin: bool,
}

impl Requester {
    pub fn of(account: &AuthenticatedAccount) -> Requester {
        Requester {
            account_id: account.id.clone(),
            is_admin: account.role == Role::Admin,
        }
    }
}

/// 스트림 턴의 이벤트. 첫 이벤트 전의 오류는 보통의 HTTP 오류가 되고, 이후의 오류는 스트림을 `done` 없이 끊는다.
pub type TurnStream = BoxStream<'static, Result<StreamEvent, ApiError>>;

pub trait SupportService {
    /// 세션을 시작하고 첫 답을 낸다(소유자 = 요청자).
    fn start<'a>(
        &'a self,
        requester: &'a Requester,
        request: StartSessionRequest,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>>;
    fn start_stream(&self, requester: Requester, request: StartSessionRequest) -> TurnStream;
    /// 사용자 턴 하나.
    fn send<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
        text: String,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>>;
    fn send_stream(&self, requester: Requester, session_id: String, text: String) -> TurnStream;
    /// 세션을 마치고 마친 뒤의 상태를 낸다.
    fn close<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>>;
    /// 대화와 리포트와 분석을 지운다. 되돌릴 수 없다.
    fn delete<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<(), ApiError>>;
    fn list<'a>(
        &'a self,
        requester: &'a Requester,
    ) -> BoxFuture<'a, Result<Vec<SessionListItemResponse>, ApiError>>;
    fn state<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>>;
    fn history<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<Vec<MessageResponse>, ApiError>>;
    fn analysis<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionAnalysisResponse, ApiError>>;
    fn report<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<MindReportResponse, ApiError>>;
}

pub type SharedSupportService = Arc<dyn SupportService + Send + Sync>;

/// 아직 대화 기능이 없다: 모든 호출이 `501 Not implemented`.
#[derive(Debug, Clone, Copy, Default)]
pub struct Unimplemented;

fn not_implemented<'a, T: Send + 'a>() -> BoxFuture<'a, Result<T, ApiError>> {
    Box::pin(async { Err(ApiError::NotImplemented) })
}

fn not_implemented_stream() -> TurnStream {
    Box::pin(stream::once(async { Err(ApiError::NotImplemented) }))
}

impl SupportService for Unimplemented {
    fn start<'a>(
        &'a self,
        _: &'a Requester,
        _: StartSessionRequest,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>> {
        not_implemented()
    }

    fn start_stream(&self, _: Requester, _: StartSessionRequest) -> TurnStream {
        not_implemented_stream()
    }

    fn send<'a>(
        &'a self,
        _: &'a Requester,
        _: &'a str,
        _: String,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>> {
        not_implemented()
    }

    fn send_stream(&self, _: Requester, _: String, _: String) -> TurnStream {
        not_implemented_stream()
    }

    fn close<'a>(
        &'a self,
        _: &'a Requester,
        _: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        not_implemented()
    }

    fn delete<'a>(&'a self, _: &'a Requester, _: &'a str) -> BoxFuture<'a, Result<(), ApiError>> {
        not_implemented()
    }

    fn list<'a>(
        &'a self,
        _: &'a Requester,
    ) -> BoxFuture<'a, Result<Vec<SessionListItemResponse>, ApiError>> {
        not_implemented()
    }

    fn state<'a>(
        &'a self,
        _: &'a Requester,
        _: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        not_implemented()
    }

    fn history<'a>(
        &'a self,
        _: &'a Requester,
        _: &'a str,
    ) -> BoxFuture<'a, Result<Vec<MessageResponse>, ApiError>> {
        not_implemented()
    }

    fn analysis<'a>(
        &'a self,
        _: &'a Requester,
        _: &'a str,
    ) -> BoxFuture<'a, Result<SessionAnalysisResponse, ApiError>> {
        not_implemented()
    }

    fn report<'a>(
        &'a self,
        _: &'a Requester,
        _: &'a str,
    ) -> BoxFuture<'a, Result<MindReportResponse, ApiError>> {
        not_implemented()
    }
}
