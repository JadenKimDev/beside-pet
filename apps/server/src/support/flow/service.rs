//! `SupportService` 의 구현: 요청마다 관문(소유자 확인)을 거쳐 흐름(시작, 턴, 닫기, 보관함, 질의, 리포트, 턴의 다시 붙기·중단·답 다시 받기)을
//! 부르고, 스트림 턴은 따로 돌려 이벤트로 낸다. 진행 중 턴 등록부는 이 구현 하나가 들고 복제본이 함께 본다.

use std::sync::Arc;

use futures_util::future::BoxFuture;
use sqlx::PgPool;

use super::access::{
    NOT_OWNER, TURN_CANCELLED, TURN_NOT_FAILED, require, require_turn, session_conflict,
};
use super::active::ActiveTurns;
use super::adapters::{AccountLanguages, SystemClock};
use super::cancel::cancel;
use super::judge::SharedReplyJudge;
use super::judging::Judging;
use super::orchestrator::{Finished, greet, handle, new_turn_id, retry};
use super::parts::FlowParts;
use super::reattach::reattach;
use super::remembering::{keep_profile_pet, remember_turn};
use super::report::report;
use super::start::create;
use super::stream::turn_stream;
use super::voice::Voice;
use crate::identity::SharedAccountService;
use crate::llm::SharedTextModel;
use crate::shared::ApiError;
use crate::support::knowledge::KnowledgeBase;
use crate::support::response::CancelledTurnResponse;
use crate::support::session::{Session, SessionError, SessionSnapshot, TurnStatus};
use crate::support::store::{DeletedSession, SessionStore};
use crate::support::{
    DeletedSessionResponse, MessageResponse, MindReportResponse, Requester, SendMessageRequest, SessionAnalysisResponse,
    SessionListItemResponse, SessionStateResponse, SharedMemoryExtractor, SharedSupportService,
    StartSessionRequest, SupportService, TurnResponse, TurnStream,
};

/// 목록이 돌려주는 최근 세션의 수(TS 의 `SESSION_LIST_LIMIT`).
const SESSION_LIST_LIMIT: u32 = 20;

/// 보관함이 돌려주는 지운 세션의 수. 3개월치를 넉넉히 덮는다.
const TRASH_LIST_LIMIT: u32 = 100;

/// 지울 리포트나 되살릴 리포트가 없다. 지운 리포트를 읽을 때도 같다(ADR-0036).
const REPORT_NOT_FOUND: &str = "Report not found";

fn report_not_found() -> ApiError {
    ApiError::NotFound(REPORT_NOT_FOUND.to_owned())
}

fn session_not_found(id: &str) -> ApiError {
    ApiError::NotFound(format!("Session not found: {id}"))
}

/// 지운 세션의 소유자 확인: 남의 것이면 403, 관리자는 통과(`require` 와 같은 규칙).
fn check_owner(snapshot: &SessionSnapshot, requester: &Requester) -> Result<(), ApiError> {
    if snapshot.owner_id != requester.account_id && !requester.is_admin {
        return Err(ApiError::Forbidden(NOT_OWNER.to_owned()));
    }
    Ok(())
}

fn trash_item(deleted: DeletedSession) -> DeletedSessionResponse {
    let session = Session::rehydrate(deleted.snapshot);
    let profile = session.grief_profile();
    DeletedSessionResponse {
        session_id: session.id().to_owned(),
        started_at: session.started_at(),
        deleted_at: deleted.deleted_at,
        purge_at: deleted.purge_at,
        pet_name: profile.pet_name.clone(),
        preferred_language: profile.language(),
    }
}

/// 대화 기능의 구현. 복제가 싸다(스트림 턴이 따로 돌며 들고 간다).
#[derive(Clone)]
pub struct SupportFlow {
    parts: Arc<FlowParts>,
    /// 진행 중 턴 등록부(프로세스 메모리, ADR-0030).
    turns: ActiveTurns,
}

impl SupportFlow {
    pub fn new(parts: FlowParts) -> SupportFlow {
        SupportFlow {
            parts: Arc::new(parts),
            turns: ActiveTurns::default(),
        }
    }

    /// 서버의 조립: Postgres 저장, 작업 디렉터리의 지식 파일, 계정 서비스의 대화 언어, 시스템 시계,
    /// 설정이 고른 답 판정기(`judge`)와 동기 턴의 후보 수, 직전 답의 임계값, 턴 추적 여부(`Config::traces_turns`), 기억 추출기.
    #[allow(clippy::too_many_arguments)] // 조립 한 곳의 칸들이라 묶을 구조체가 FlowParts 와 겹친다
    pub fn live(
        db: PgPool,
        model: SharedTextModel,
        accounts: SharedAccountService,
        judge: SharedReplyJudge,
        candidates: u8,
        threshold: f32,
        trace_turns: bool,
        extractor: SharedMemoryExtractor,
    ) -> SharedSupportService {
        Arc::new(SupportFlow::new(FlowParts {
            model,
            memory: super::adapters::memory_store(db.clone()),
            extractor,
            sessions: Arc::new(SessionStore::new(db)),
            knowledge: KnowledgeBase::load(),
            languages: Arc::new(AccountLanguages(accounts)),
            clock: Arc::new(SystemClock),
            judging: Judging {
                judge,
                candidates,
                threshold,
            },
            trace_turns,
        }))
    }

    async fn start_turn(
        &self,
        requester: &Requester,
        request: StartSessionRequest,
        voice: &Voice<'_>,
    ) -> Result<TurnResponse, ApiError> {
        let parts = self.parts.as_ref();
        let profile = request.grief_profile.clone();
        let started = create(parts, requester, request).await?;
        parts.sessions.save(&started.session.snapshot()).await?;
        if let Some(profile) = &profile {
            let session = &started.session;
            keep_profile_pet(
                parts,
                session.owner_id(),
                session.id(),
                profile,
                session.started_at(),
            )
            .await;
        }
        greet(parts, started.session, started.previous.as_ref(), voice).await
    }

    async fn send_turn(
        &self,
        requester: &Requester,
        session_id: &str,
        request: SendMessageRequest,
        voice: &Voice<'_>,
    ) -> Result<Finished, ApiError> {
        let turn_id = request.turn_id.unwrap_or_else(new_turn_id);
        let session = self.writable(requester, session_id, &turn_id).await?;
        let parts = self.parts.as_ref();
        let finished = handle(
            parts,
            &self.turns,
            session,
            turn_id.clone(),
            &request.text,
            voice,
        )
        .await?;
        self.remember_after(&finished, session_id, &turn_id, voice);
        Ok(finished)
    }

    async fn retry_failed(
        &self,
        requester: &Requester,
        session_id: &str,
        turn_id: &str,
        voice: &Voice<'_>,
    ) -> Result<Finished, ApiError> {
        let session = self.retriable(requester, session_id, turn_id).await?;
        let finished = retry(self.parts.as_ref(), &self.turns, session, turn_id, voice).await?;
        self.remember_after(&finished, session_id, turn_id, voice);
        Ok(finished)
    }

    /// 답이 끝난 턴이면 그 사용자 발화의 기억 추출을 맡긴다(턴 지연에 더하지 않는다): 스트림은 마지막 이벤트 뒤에, 동기는 따로.
    /// 중단한 턴은 맡기지 않는다. 위기 턴은 추출이 스스로 거른다.
    fn remember_after(
        &self,
        finished: &Finished,
        session_id: &str,
        turn_id: &str,
        voice: &Voice<'_>,
    ) {
        if !matches!(finished, Finished::Done(_)) {
            return;
        }
        let work = remember_turn(
            self.parts.clone(),
            session_id.to_owned(),
            turn_id.to_owned(),
        );
        match voice {
            Voice::Streamed(out) => out.after_last(work),
            Voice::Whole => {
                tokio::spawn(work);
            }
        }
    }

    /// 답을 다시 받을 수 있는 세션: 있고, 요청자의 것이고, 그 턴이 실패했고, 열려 있다. 소유자의 대화 언어를 따른다.
    async fn retriable(
        &self,
        requester: &Requester,
        session_id: &str,
        turn_id: &str,
    ) -> Result<Session, ApiError> {
        let parts = self.parts.as_ref();
        let mut session = require(parts.sessions.as_ref(), session_id, requester).await?;
        if require_turn(&session, turn_id)?.status != TurnStatus::Failed {
            return Err(ApiError::Conflict(TURN_NOT_FAILED.to_owned()));
        }
        if session.closed() {
            return Err(session_conflict(session_id, SessionError::Closed));
        }
        if let Some(language) = parts.languages.chat_language(session.owner_id()).await? {
            session.adopt_language(language);
        }
        Ok(session)
    }

    /// 턴을 받을 수 있는 세션: 있고, 요청자의 것이고, 이 턴 id 를 아직 받지 않았고, 열려 있다. 소유자의 대화 언어를 이번 턴부터 따른다.
    /// 받은 턴 id 는 닫힌 세션에서도 "받았다"는 409 다(다시 보낸 클라이언트가 기록을 다시 읽는다). 위기 판정보다 앞서 거른다.
    async fn writable(
        &self,
        requester: &Requester,
        session_id: &str,
        turn_id: &str,
    ) -> Result<Session, ApiError> {
        let parts = self.parts.as_ref();
        let mut session = require(parts.sessions.as_ref(), session_id, requester).await?;
        if session.turns().iter().any(|turn| turn.id == turn_id) {
            return Err(session_conflict(
                session_id,
                SessionError::TurnAlreadyReceived,
            ));
        }
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

    /// 보관함으로 옮긴다(소프트 삭제). 이미 지운 내 세션이면 그대로 성공한다(멱등).
    async fn delete_session(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<(), ApiError> {
        let sessions = self.parts.sessions.as_ref();
        if sessions.find(session_id).await?.is_none() {
            return self.find_deleted(requester, session_id).await.map(|_| ());
        }
        self.find(requester, session_id).await?;
        if !sessions.soft_delete(session_id).await? {
            return Err(session_not_found(session_id));
        }
        Ok(())
    }

    /// 지운 세션 하나. 없거나 살아 있으면 404, 남의 것이면 403.
    async fn find_deleted(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<SessionSnapshot, ApiError> {
        let snapshot = self
            .parts
            .sessions
            .find_deleted(session_id)
            .await?
            .ok_or_else(|| session_not_found(session_id))?;
        check_owner(&snapshot, requester)?;
        Ok(snapshot)
    }

    /// 되살리고 상태를 낸다. 살아 있는 세션이면 그대로 낸다.
    async fn restore_session(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<SessionStateResponse, ApiError> {
        let sessions = self.parts.sessions.as_ref();
        if sessions.find(session_id).await?.is_none() {
            self.find_deleted(requester, session_id).await?;
            if !sessions.restore(session_id).await? {
                return Err(session_not_found(session_id));
            }
        }
        Ok(self.find(requester, session_id).await?.state_response())
    }

    async fn list_trash(
        &self,
        requester: &Requester,
    ) -> Result<Vec<DeletedSessionResponse>, ApiError> {
        let deleted = self
            .parts
            .sessions
            .list_deleted(&requester.account_id, TRASH_LIST_LIMIT)
            .await?;
        Ok(deleted.into_iter().map(trash_item).collect())
    }

    /// 리포트만 지운다. 아직 쓰지 않았거나 이미 지웠으면 404.
    async fn delete_report_of(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<(), ApiError> {
        self.find(requester, session_id).await?;
        if !self.parts.sessions.delete_report(session_id).await? {
            return Err(report_not_found());
        }
        Ok(())
    }

    /// 지운 리포트를 되살려 저장된 그대로 낸다(다시 쓰지 않는다).
    async fn restore_report_of(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<MindReportResponse, ApiError> {
        self.find(requester, session_id).await?;
        if !self.parts.sessions.restore_report(session_id).await? {
            return Err(report_not_found());
        }
        let session = self.find(requester, session_id).await?;
        session
            .report()
            .map(|stored| stored.to_response(session.started_at()))
            .ok_or_else(report_not_found)
    }

    /// 리포트. 지운 리포트는 스냅샷에서 없음으로 보이므로, 새로 쓰기 전에 지운 것인지 묻고 404 로 막는다(ADR-0008).
    async fn report_of(
        &self,
        requester: &Requester,
        session_id: &str,
    ) -> Result<MindReportResponse, ApiError> {
        let session = self.find(requester, session_id).await?;
        if session.report().is_none()
            && self
                .parts
                .sessions
                .deleted_reports(&[session_id])
                .await?
                .contains(session_id)
        {
            return Err(report_not_found());
        }
        report(self.parts.as_ref(), session).await
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
        let ids: Vec<&str> = snapshots
            .iter()
            .map(|snapshot| snapshot.id.as_str())
            .collect();
        let activity = self.parts.sessions.message_activity(&ids).await?;
        let deleted_reports = self.parts.sessions.deleted_reports(&ids).await?;
        Ok(snapshots
            .into_iter()
            .map(|snapshot| {
                let counted = activity.get(&snapshot.id).copied().unwrap_or_default();
                let report_deleted = deleted_reports.contains(&snapshot.id);
                let mut item = Session::rehydrate(snapshot).list_item(&counted);
                if report_deleted {
                    item.report_deleted = true;
                    item.report_available = false;
                }
                item
            })
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
                .map(Finished::Done)
        })
    }

    fn send<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
        request: SendMessageRequest,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>> {
        Box::pin(async move {
            match self
                .send_turn(requester, session_id, request, &Voice::Whole)
                .await?
            {
                Finished::Done(result) => Ok(result),
                Finished::Cancelled => Err(ApiError::Conflict(TURN_CANCELLED.to_owned())),
            }
        })
    }

    fn send_stream(
        &self,
        requester: Requester,
        session_id: String,
        request: SendMessageRequest,
    ) -> TurnStream {
        let flow = self.clone();
        turn_stream(move |out| async move {
            flow.send_turn(&requester, &session_id, request, &Voice::Streamed(&out))
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
        Box::pin(self.report_of(requester, session_id))
    }

    fn restore<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        Box::pin(self.restore_session(requester, session_id))
    }

    fn list_deleted<'a>(
        &'a self,
        requester: &'a Requester,
    ) -> BoxFuture<'a, Result<Vec<DeletedSessionResponse>, ApiError>> {
        Box::pin(self.list_trash(requester))
    }

    fn delete_report<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<(), ApiError>> {
        Box::pin(self.delete_report_of(requester, session_id))
    }

    fn restore_report<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<MindReportResponse, ApiError>> {
        Box::pin(self.restore_report_of(requester, session_id))
    }

    fn turn_stream(&self, requester: Requester, session_id: String, turn_id: String) -> TurnStream {
        let flow = self.clone();
        turn_stream(move |out| async move {
            reattach(
                flow.parts.sessions.as_ref(),
                &flow.turns,
                &requester,
                &session_id,
                &turn_id,
                &out,
            )
            .await
        })
    }

    fn cancel_turn<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
        turn_id: &'a str,
    ) -> BoxFuture<'a, Result<CancelledTurnResponse, ApiError>> {
        Box::pin(cancel(
            self.parts.as_ref(),
            &self.turns,
            requester,
            session_id,
            turn_id,
        ))
    }

    fn retry_turn(&self, requester: Requester, session_id: String, turn_id: String) -> TurnStream {
        let flow = self.clone();
        turn_stream(move |out| async move {
            flow.retry_failed(&requester, &session_id, &turn_id, &Voice::Streamed(&out))
                .await
        })
    }
}
