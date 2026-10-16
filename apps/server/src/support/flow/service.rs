//! `SupportService` 의 구현: 요청마다 관문(소유자 확인)을 거쳐 흐름(시작, 턴, 닫기, 삭제, 질의, 리포트)을 부르고, 스트림 턴은 따로 돌려 이벤트로 낸다.

use std::sync::Arc;

use futures_util::future::BoxFuture;
use sqlx::PgPool;

use super::access::{require, session_conflict};
use super::adapters::{AccountLanguages, SystemClock};
use super::deadline::{CallLimits, Deadlined};
use super::orchestrator::{greet, handle};
use super::parts::FlowParts;
use super::report::report;
use super::start::create;
use super::stream::turn_stream;
use super::voice::Voice;
use crate::identity::SharedAccountService;
use crate::llm::SharedTextModel;
use crate::shared::ApiError;
use crate::support::knowledge::KnowledgeBase;
use crate::support::session::{Session, SessionError};
use crate::support::store::SessionStore;
use crate::support::{
    MessageResponse, MindReportResponse, Requester, SessionAnalysisResponse,
    SessionListItemResponse, SessionStateResponse, SharedSupportService, StartSessionRequest,
    SupportService, TurnResponse, TurnStream,
};

/// 목록이 돌려주는 최근 세션의 수(TS 의 `SESSION_LIST_LIMIT`).
const SESSION_LIST_LIMIT: u32 = 20;

/// 대화 기능의 구현. 복제가 싸다(스트림 턴이 따로 돌며 들고 간다).
#[derive(Clone)]
pub struct SupportFlow {
    parts: Arc<FlowParts>,
}

impl SupportFlow {
    /// 모델에 `parts.limits` 의 시간 제한을 두른다.
    pub fn new(parts: FlowParts) -> SupportFlow {
        let model: SharedTextModel = Arc::new(Deadlined::new(parts.model, parts.limits));
        SupportFlow {
            parts: Arc::new(FlowParts { model, ..parts }),
        }
    }

    /// 서버의 조립: Postgres 저장, 작업 디렉터리의 지식 파일, 계정 서비스의 대화 언어, 시스템 시계, 실제 제한.
    pub fn live(
        db: PgPool,
        model: SharedTextModel,
        accounts: SharedAccountService,
    ) -> SharedSupportService {
        Arc::new(SupportFlow::new(FlowParts {
            model,
            sessions: Arc::new(SessionStore::new(db)),
            knowledge: KnowledgeBase::load(),
            languages: Arc::new(AccountLanguages(accounts)),
            clock: Arc::new(SystemClock),
            limits: CallLimits::default(),
        }))
    }

    async fn start_turn(
        &self,
        requester: &Requester,
        request: StartSessionRequest,
        voice: &Voice<'_>,
    ) -> Result<TurnResponse, ApiError> {
        let parts = self.parts.as_ref();
        let started = create(parts, requester, request).await?;
        parts.sessions.save(&started.session.snapshot()).await?;
        greet(parts, started.session, started.previous.as_ref(), voice).await
    }

    async fn send_turn(
        &self,
        requester: &Requester,
        session_id: &str,
        text: &str,
        voice: &Voice<'_>,
    ) -> Result<TurnResponse, ApiError> {
        let session = self.writable(requester, session_id).await?;
        handle(self.parts.as_ref(), session, text, voice).await
    }

    /// 턴을 받을 수 있는 세션: 있고, 요청자의 것이고, 열려 있다. 소유자의 대화 언어를 이번 턴부터 따른다.
    async fn writable(&self, requester: &Requester, session_id: &str) -> Result<Session, ApiError> {
        let parts = self.parts.as_ref();
        let mut session = require(parts.sessions.as_ref(), session_id, requester).await?;
        if session.closed() {
            return Err(session_conflict(session_id, SessionError::Closed));
        }
        if let Some(language) = parts.languages.chat_language(session.owner_id()).await? {
            session.adopt_language(language);
        }
        Ok(session)
    }

    async fn find(&self, requester: &Requester, session_id: &str) -> Result<Session, ApiError> {
        require(self.parts.sessions.as_ref(), session_id, requester).await
    }

    /// 닫는다. 이미 닫혔으면 쓰지 않는다(멱등).
    async fn close_session(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<SessionStateResponse, ApiError> {
        let mut session = self.find(requester, session_id).await?;
        if !session.closed() {
            session.close();
            self.parts.sessions.save(&session.snapshot()).await?;
        }
        Ok(session.state_response())
    }

    async fn delete_session(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<(), ApiError> {
        self.find(requester, session_id).await?;
        self.parts.sessions.delete(session_id).await
    }

    async fn list_sessions(
        &self,
        requester: &Requester,
    ) -> Result<Vec<SessionListItemResponse>, ApiError> {
        let snapshots = self
            .parts
            .sessions
            .find_by_owner(&requester.account_id, SESSION_LIST_LIMIT)
            .await?;
        Ok(snapshots
            .into_iter()
            .map(|snapshot| Session::rehydrate(snapshot).list_item())
            .collect())
    }
}

impl SupportService for SupportFlow {
    fn start<'a>(
        &'a self,
        requester: &'a Requester,
        request: StartSessionRequest,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>> {
        Box::pin(async move { self.start_turn(requester, request, &Voice::Whole).await })
    }

    fn start_stream(&self, requester: Requester, request: StartSessionRequest) -> TurnStream {
        let flow = self.clone();
        turn_stream(move |out| async move {
            flow.start_turn(&requester, request, &Voice::Streamed(&out))
                .await
        })
    }

    fn send<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
        text: String,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>> {
        Box::pin(async move {
            self.send_turn(requester, session_id, &text, &Voice::Whole)
                .await
        })
    }

    fn send_stream(&self, requester: Requester, session_id: String, text: String) -> TurnStream {
        let flow = self.clone();
        turn_stream(move |out| async move {
            flow.send_turn(&requester, &session_id, &text, &Voice::Streamed(&out))
                .await
        })
    }

    fn close<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        Box::pin(self.close_session(requester, session_id))
    }

    fn delete<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<(), ApiError>> {
        Box::pin(self.delete_session(requester, session_id))
    }

    fn list<'a>(
        &'a self,
        requester: &'a Requester,
    ) -> BoxFuture<'a, Result<Vec<SessionListItemResponse>, ApiError>> {
        Box::pin(self.list_sessions(requester))
    }

    fn state<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        Box::pin(async move { Ok(self.find(requester, session_id).await?.state_response()) })
    }

    fn history<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<Vec<MessageResponse>, ApiError>> {
        Box::pin(async move { Ok(self.find(requester, session_id).await?.history_response()) })
    }

    fn analysis<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionAnalysisResponse, ApiError>> {
        Box::pin(async move { Ok(self.find(requester, session_id).await?.analysis_response()) })
    }

    fn report<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<MindReportResponse, ApiError>> {
        Box::pin(async move {
            let session = self.find(requester, session_id).await?;
            report(self.parts.as_ref(), session).await
        })
    }
}
