//! identity 라우터의 겉 테스트. 서비스와 인증은 더블이고 DB 는 쓰지 않는다.
//! 검증 문구의 기대값은 TS API 의 ValidationPipe(whitelist, forbidNonWhitelisted, transform)와
//! class-validator 0.14 에 같은 DTO 를 넣어 얻은 응답, 쿠키 헤더는 Express 4.22 의 `res.cookie`·`res.clearCookie` 가 낸 것이다.

mod admin;
mod auth;
mod doubles;

use std::sync::Arc;

use axum::body::{Body, to_bytes};
use axum::http::{HeaderMap, Method, Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;

use super::{IdentityState, router};
use doubles::{FakeAccounts, FakeAuthenticator};

struct Reply {
    status: StatusCode,
    headers: HeaderMap,
    body: Value,
}

struct Harness {
    accounts: Arc<FakeAccounts>,
    state: IdentityState,
}

impl Harness {
    fn new(secure_cookies: bool) -> Harness {
        let accounts = Arc::new(FakeAccounts::default());
        let state = IdentityState {
            accounts: accounts.clone(),
            authenticator: Arc::new(FakeAuthenticator),
            secure_cookies,
        };
        Harness { accounts, state }
    }

    fn calls(&self) -> Vec<String> {
        self.accounts.calls()
    }

    async fn send(
        &self,
        method: Method,
        uri: &str,
        cookie: Option<&str>,
        body: Option<&str>,
    ) -> Reply {
        send_to(self.state.clone(), method, uri, cookie, body).await
    }
}

async fn send_to(
    state: IdentityState,
    method: Method,
    uri: &str,
    cookie: Option<&str>,
    body: Option<&str>,
) -> Reply {
    let mut request = Request::builder().method(method).uri(uri);
    if let Some(cookie) = cookie {
        request = request.header("cookie", cookie);
    }
    let request = match body {
        Some(body) => request
            .header("content-type", "application/json")
            .body(Body::from(body.to_owned())),
        None => request.body(Body::empty()),
    }
    .unwrap();
    let response = router::<IdentityState>()
        .with_state(state)
        .oneshot(request)
        .await
        .unwrap();
    let status = response.status();
    let headers = response.headers().clone();
    let bytes = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    let body = if bytes.is_empty() {
        Value::Null
    } else {
        serde_json::from_slice(&bytes).unwrap()
    };
    Reply {
        status,
        headers,
        body,
    }
}

/// 쿠키 한 개짜리 `Cookie` 헤더. 더블은 토큰 글자로 계정을 고른다.
fn token(value: &str) -> String {
    format!("beside-pet.token={value}")
}

fn set_cookie(reply: &Reply) -> Vec<String> {
    reply
        .headers
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap().to_owned())
        .collect()
}
