//! 라우트 테스트의 더블: 토큰으로 역할을 정하는 인증기와, 받은 요청자와 인자를 응답에 비추는 대화 서비스.

use std::sync::Arc;

use axum::Router;
use axum::extract::FromRef;
use chrono::{TimeZone, Utc};
use futures_util::future::BoxFuture;
use futures_util::stream;

use super::super::router;
use crate::identity::{
    AuthenticatedAccount, Authenticator, ChatLanguage, Role, SharedAuthenticator,
};
use crate::shared::ApiError;
use crate::support::{
    MessageResponse, MessageRole, MindReportResponse, Requester, SessionAnalysisResponse,
    SessionListItemResponse, SessionStateResponse, SharedSupportService, StartSessionRequest,
    StreamEvent, SupportService, TurnResponse, TurnStream,
};

pub struct Accounts;

impl Authenticator for Accounts {
    fn authenticate<'a>(
        &'a self,
        token: &'a str,
    ) -> BoxFuture<'a, Result<Option<AuthenticatedAccount>, ApiError>> {
        let role = match token {
            "viewer" => Some(Role::Viewer),
            "admin" => Some(Role::Admin),
            _ => None,
        };
        Box::pin(async move {
            Ok(role.map(|role| AuthenticatedAccount {
                id: format!("acct-{token}"),
                username: "fixture".to_owned(),
                company: "Fixture Co".to_owned(),
                role,
            }))
        })
    }
}

/// 받은 요청자와 인자를 응답에 비춰 돌려준다.
pub struct Echo;

fn who(requester: &Requester) -> String {
    format!("{}/{}", requester.account_id, requester.is_admin)
}

fn turn(reply: String) -> TurnResponse {
    TurnResponse {
        reply,
        task: 1,
        progress: 0.0,
        support_level: 1,
        done: false,
    }
}

fn state_of(session_id: String) -> SessionStateResponse {
    SessionStateResponse {
        session_id,
        task: 2,
        progress: 0.25,
        support_level: 1,
        closed: true,
        report_available: true,
    }
}

fn at() -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap()
}

fn turn_events(reply: String) -> TurnStream {
    Box::pin(stream::iter(vec![
        Ok(StreamEvent::Meta {
            task: 1,
            progress: 0.0,
            support_level: 1,
            done: false,
        }),
        Ok(StreamEvent::Token {
            text: reply.clone(),
        }),
        Ok(StreamEvent::Done {
            result: turn(reply),
        }),
    ]))
}

impl SupportService for Echo {
    fn start<'a>(
        &'a self,
        requester: &'a Requester,
        request: StartSessionRequest,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>> {
        let has_profile = request.grief_profile.is_some();
        let reply = format!(
            "start {} {} {has_profile}",
            who(requester),
            request.session_id
        );
        Box::pin(async move { Ok(turn(reply)) })
    }

    fn start_stream(&self, requester: Requester, request: StartSessionRequest) -> TurnStream {
        turn_events(format!("start {} {}", who(&requester), request.session_id))
    }

    fn send<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
        text: String,
    ) -> BoxFuture<'a, Result<TurnResponse, ApiError>> {
        let reply = format!("send {} {session_id} {text}", who(requester));
        Box::pin(async move { Ok(turn(reply)) })
    }

    fn send_stream(&self, requester: Requester, session_id: String, text: String) -> TurnStream {
        turn_events(format!("send {} {session_id} {text}", who(&requester)))
    }

    fn close<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        let id = format!("close {} {session_id}", who(requester));
        Box::pin(async move { Ok(state_of(id)) })
    }

    fn delete<'a>(
        &'a self,
        _requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<(), ApiError>> {
        let missing = session_id == "missing";
        Box::pin(async move {
            if missing {
                Err(ApiError::NotFound("Session not found".to_owned()))
            } else {
                Ok(())
            }
        })
    }

    fn list<'a>(
        &'a self,
        requester: &'a Requester,
    ) -> BoxFuture<'a, Result<Vec<SessionListItemResponse>, ApiError>> {
        let id = format!("list {}", who(requester));
        Box::pin(async move {
            Ok(vec![SessionListItemResponse {
                session_id: id,
                started_at: at(),
                closed: false,
                reached_task: 1,
                progress: 0.0,
                pet_name: None,
                preferred_language: ChatLanguage::Ko,
                report_available: false,
                last_message_at: Some(at()),
                duration_minutes: Some(12),
                message_count: 5,
            }])
        })
    }

    fn state<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionStateResponse, ApiError>> {
        let id = format!("state {} {session_id}", who(requester));
        Box::pin(async move { Ok(state_of(id)) })
    }

    fn history<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<Vec<MessageResponse>, ApiError>> {
        let text = format!("history {} {session_id}", who(requester));
        Box::pin(async move {
            Ok(vec![MessageResponse {
                role: MessageRole::User,
                text,
                task: 1,
                at: at(),
            }])
        })
    }

    fn analysis<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<SessionAnalysisResponse, ApiError>> {
        let id = format!("analysis {} {session_id}", who(requester));
        Box::pin(async move {
            Ok(SessionAnalysisResponse {
                session_id: id,
                closed: false,
                plan: None,
                analyses: vec![],
                summary: None,
                history: vec![],
            })
        })
    }

    fn report<'a>(
        &'a self,
        requester: &'a Requester,
        session_id: &'a str,
    ) -> BoxFuture<'a, Result<MindReportResponse, ApiError>> {
        let pet_name = format!("report {} {session_id}", who(requester));
        Box::pin(async move {
            Ok(MindReportResponse {
                at: at(),
                started_at: at(),
                pet_name,
                reached_task: 2,
                progress: 0.25,
                locale: ChatLanguage::En,
                sections: vec![],
            })
        })
    }
}

#[derive(Clone)]
struct TestState {
    support: SharedSupportService,
    authenticator: SharedAuthenticator,
}

impl FromRef<TestState> for SharedSupportService {
    fn from_ref(state: &TestState) -> SharedSupportService {
        state.support.clone()
    }
}

impl FromRef<TestState> for SharedAuthenticator {
    fn from_ref(state: &TestState) -> SharedAuthenticator {
        state.authenticator.clone()
    }
}

pub fn app(support: SharedSupportService) -> Router {
    router::<TestState>().with_state(TestState {
        support,
        authenticator: Arc::new(Accounts),
    })
}
