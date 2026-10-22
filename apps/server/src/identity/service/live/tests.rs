//! `IdentityService` 의 흐름 테스트. 테스트마다 새 스키마(`AccountsSchema`)에서 돈다.
//! DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다). 아이디와 비밀번호는 지어낸 값이다.

mod admin;
mod delete;
mod log_out;
mod setup;
mod sign_in;

use std::sync::Arc;

use chrono::{DateTime, TimeZone, Utc};

use super::IdentityService;
use crate::identity::setup::SetupGate;
use crate::identity::store::tests::AccountsSchema;
use crate::identity::token::TokenSigner;
use crate::identity::{
    AccountService, AccountStatus, Authenticator, LoginInput, RegisterInput, Role, SetupInput,
    SignedIn,
};
use crate::shared::ApiError;

const SECRET: &str = "fixture-secret-not-a-real-one";
const SETUP_TOKEN: &str = "0123456789abcdef0123456789abcdef";
const ADMIN_NAME: &str = "maple-admin";
const ADMIN_PASSWORD: &str = "fixture-pass-admin";
const VIEWER_NAME: &str = "willow";
const VIEWER_PASSWORD: &str = "fixture-pass-viewer";

/// 테스트의 "지금". 시계는 이 값에 고정한다.
fn fixed_now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 16, 9, 0, 0).unwrap()
}

/// 새 스키마와 그 위의 서비스. 끝나면 `close` 로 스키마를 지운다.
struct Fixture {
    schema: AccountsSchema,
    service: IdentityService,
}

impl Fixture {
    async fn with_gate(gate: SetupGate) -> Fixture {
        let schema = AccountsSchema::open().await;
        let service = IdentityService::new(
            schema.store(),
            TokenSigner::new(SECRET, "1h").unwrap(),
            Arc::new(gate),
            fixed_now,
        );
        Fixture { schema, service }
    }

    /// 관리자가 없는 DB: setup 토큰이 열려 있다.
    async fn fresh() -> Fixture {
        Fixture::with_gate(SetupGate::open(SETUP_TOKEN.to_owned())).await
    }

    /// setup 을 마친 DB: 관리자 하나와 그 로그인 결과.
    async fn with_admin() -> (Fixture, SignedIn) {
        let fixture = Fixture::fresh().await;
        let admin = fixture
            .service
            .setup(setup_input(SETUP_TOKEN))
            .await
            .unwrap();
        (fixture, admin)
    }

    async fn close(self) {
        self.schema.close().await;
    }
}

fn setup_input(token: &str) -> SetupInput {
    SetupInput {
        token: token.to_owned(),
        username: ADMIN_NAME.to_owned(),
        password: ADMIN_PASSWORD.to_owned(),
        company: None,
    }
}

fn register_input() -> RegisterInput {
    RegisterInput {
        username: VIEWER_NAME.to_owned(),
        password: VIEWER_PASSWORD.to_owned(),
        company: "Fictional Pets".to_owned(),
    }
}

fn login_input(username: &str, password: &str) -> LoginInput {
    LoginInput {
        username: username.to_owned(),
        password: password.to_owned(),
    }
}

/// 정지 3개월 전의 완전 삭제.
fn suspension_required() -> ApiError {
    ApiError::Conflict("Account must be suspended for 3 months before deletion".to_owned())
}

fn unauthorized(message: &str) -> ApiError {
    ApiError::Unauthorized(message.to_owned())
}

#[tokio::test]
async fn setup_로그인_me_승인_정지_삭제_만료의_흐름() {
    let fixture = Fixture::fresh().await;
    let service = &fixture.service;

    // setup → 곧바로 로그인된 관리자
    assert!(service.setup_status().await.unwrap());
    let admin = service.setup(setup_input(SETUP_TOKEN)).await.unwrap();
    assert_eq!(admin.account.role, Role::Admin);
    assert_eq!(admin.account.status, AccountStatus::Active);
    assert_eq!(admin.account.company, "Beside Pet");
    assert_eq!(admin.account.last_login_at, Some(fixed_now()));
    assert!(!service.setup_status().await.unwrap());

    // 쿠키의 토큰 → 인증된 계정 → me
    let current = service.authenticate(&admin.token).await.unwrap().unwrap();
    assert_eq!(current.id, admin.account.id);
    assert_eq!(current.role, Role::Admin);
    assert_eq!(current.username, ADMIN_NAME);
    let me = service.me(current.id.clone()).await.unwrap();
    assert_eq!(me.username, ADMIN_NAME);
    assert_eq!(me.last_login_at, Some(fixed_now()));

    // 신청 → pending 은 로그인 403 → 승인 뒤 로그인
    let applied = service.register(register_input()).await.unwrap();
    assert_eq!(applied.status, AccountStatus::Pending);
    assert_eq!(applied.role, Role::Viewer);
    assert_eq!(
        service
            .login(login_input(VIEWER_NAME, VIEWER_PASSWORD))
            .await
            .unwrap_err(),
        ApiError::Forbidden("Your account is awaiting approval.".to_owned())
    );
    let approved = service.approve(applied.id.clone()).await.unwrap();
    assert_eq!(approved.status, AccountStatus::Active);
    let viewer = service
        .login(login_input(VIEWER_NAME, VIEWER_PASSWORD))
        .await
        .unwrap();
    assert_eq!(viewer.account.last_login_at, Some(fixed_now()));
    let current = service.authenticate(&viewer.token).await.unwrap().unwrap();
    assert_eq!(current.role, Role::Viewer);
    assert_eq!(current.company, "Fictional Pets");

    // 정지 → 다음 요청부터 401, 로그인은 revoked 문구
    let revoked = service.revoke(applied.id.clone()).await.unwrap();
    assert_eq!(revoked.status, AccountStatus::Revoked);
    assert_eq!(
        service.authenticate(&viewer.token).await.unwrap_err(),
        unauthorized("Account is unavailable")
    );
    assert_eq!(
        service
            .login(login_input(VIEWER_NAME, VIEWER_PASSWORD))
            .await
            .unwrap_err(),
        unauthorized("Account is revoked")
    );

    // 재개 → 같은 토큰이 다시 통한다
    service.reactivate(applied.id.clone()).await.unwrap();
    assert!(service.authenticate(&viewer.token).await.unwrap().is_some());

    // 소프트 삭제 → 401, 로그인은 unavailable
    let deleted = service.soft_delete(applied.id.clone()).await.unwrap();
    assert_eq!(deleted.status, AccountStatus::Deleted);
    assert_eq!(
        service.authenticate(&viewer.token).await.unwrap_err(),
        unauthorized("Account is unavailable")
    );
    assert_eq!(
        service
            .login(login_input(VIEWER_NAME, VIEWER_PASSWORD))
            .await
            .unwrap_err(),
        unauthorized("Account is unavailable")
    );

    // 지난 만료 → 401, 로그인은 expired 문구. 만료를 지우면 다시 통한다
    service.reactivate(applied.id.clone()).await.unwrap();
    let expired = service
        .set_expiry(
            applied.id.clone(),
            Some("2026-10-16T08:00:00.000Z".to_owned()),
        )
        .await
        .unwrap();
    assert!(expired.expired);
    assert_eq!(
        expired.expires_at,
        Some(Utc.with_ymd_and_hms(2026, 10, 16, 8, 0, 0).unwrap())
    );
    assert_eq!(
        service.authenticate(&viewer.token).await.unwrap_err(),
        unauthorized("Account is unavailable")
    );
    assert_eq!(
        service
            .login(login_input(VIEWER_NAME, VIEWER_PASSWORD))
            .await
            .unwrap_err(),
        unauthorized("Account has expired")
    );
    let cleared = service.set_expiry(applied.id.clone(), None).await.unwrap();
    assert_eq!(cleared.expires_at, None);
    assert!(!cleared.expired);
    assert!(service.authenticate(&viewer.token).await.unwrap().is_some());

    // 목록은 지운 것까지 모두
    let listed = service.list_accounts().await.unwrap();
    assert_eq!(listed.len(), 2);

    // 정지하지 않은 계정의 완전 삭제는 409 이고 계정은 남는다(통과하는 흐름은 `delete` 테스트)
    assert_eq!(
        service
            .delete_account(applied.id.clone())
            .await
            .unwrap_err(),
        suspension_required()
    );
    assert_eq!(service.list_accounts().await.unwrap().len(), 2);

    fixture.close().await;
}
