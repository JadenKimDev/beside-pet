//! 관리자 동작: 발급, 승인, 없는 id, 만료 입력.

use chrono::{TimeZone, Utc};

use super::{Fixture, VIEWER_NAME, register_input};
use crate::identity::{AccountService, AccountStatus, CreateAccountInput, Role};
use crate::shared::{ApiError, Message};

fn create_input(username: &str) -> CreateAccountInput {
    CreateAccountInput {
        username: username.to_owned(),
        password: "fixture-pass-issued".to_owned(),
        company: "Fictional Clinic".to_owned(),
        role: None,
        expires_at: None,
    }
}

#[tokio::test]
async fn 발급한_계정은_active_viewer_가_기본이다() {
    let fixture = Fixture::fresh().await;
    let issued = fixture
        .service
        .create_account(create_input("birch"))
        .await
        .unwrap();
    assert_eq!(issued.status, AccountStatus::Active);
    assert_eq!(issued.role, Role::Viewer);
    assert_eq!(issued.expires_at, None);
    assert_eq!(issued.last_login_at, None);
    assert!(uuid_v4_like(&issued.id), "{}", issued.id);
    fixture.close().await;
}

/// 8-4-4-4-12 의 소문자 hex 이고 버전 자리가 4 인가.
fn uuid_v4_like(id: &str) -> bool {
    let parts: Vec<&str> = id.split('-').collect();
    parts.iter().map(|p| p.len()).collect::<Vec<_>>() == [8, 4, 4, 4, 12]
        && id
            .chars()
            .all(|c| c == '-' || c.is_ascii_digit() || ('a'..='f').contains(&c))
        && parts[2].starts_with('4')
}

#[tokio::test]
async fn 발급은_역할과_만료를_받는다() {
    let fixture = Fixture::fresh().await;
    let issued = fixture
        .service
        .create_account(CreateAccountInput {
            role: Some(Role::Admin),
            expires_at: Some("2026-12-31T23:59:59.000Z".to_owned()),
            ..create_input("cedar")
        })
        .await
        .unwrap();
    assert_eq!(issued.role, Role::Admin);
    assert_eq!(
        issued.expires_at,
        Some(Utc.with_ymd_and_hms(2026, 12, 31, 23, 59, 59).unwrap())
    );
    assert!(!issued.expired);
    fixture.close().await;
}

#[tokio::test]
async fn 발급한_아이디가_이미_있으면_409_다() {
    let fixture = Fixture::fresh().await;
    fixture.service.register(register_input()).await.unwrap();
    assert_eq!(
        fixture
            .service
            .create_account(create_input(VIEWER_NAME))
            .await
            .unwrap_err(),
        ApiError::Conflict(format!("Username already exists: {VIEWER_NAME}"))
    );
    fixture.close().await;
}

#[tokio::test]
async fn 읽지_못하는_만료_시각은_400_이다() {
    let fixture = Fixture::fresh().await;
    let expected = ApiError::BadRequest(Message::Many(vec![
        "expiresAt must be a valid ISO 8601 date string".to_owned(),
    ]));
    assert_eq!(
        fixture
            .service
            .create_account(CreateAccountInput {
                expires_at: Some("2026-W52".to_owned()),
                ..create_input("aspen")
            })
            .await
            .unwrap_err(),
        expected
    );
    let issued = fixture
        .service
        .create_account(create_input("aspen"))
        .await
        .unwrap();
    assert_eq!(
        fixture
            .service
            .set_expiry(issued.id, Some("2026-W52".to_owned()))
            .await
            .unwrap_err(),
        expected
    );
    fixture.close().await;
}

#[tokio::test]
async fn 승인은_pending_만_한다() {
    let fixture = Fixture::fresh().await;
    let issued = fixture
        .service
        .create_account(create_input("hazel"))
        .await
        .unwrap();
    assert_eq!(
        fixture.service.approve(issued.id).await.unwrap_err(),
        ApiError::Conflict("Only a pending account can be approved.".to_owned())
    );
    fixture.close().await;
}

#[tokio::test]
async fn 없는_id_의_관리자_동작은_404_다() {
    let fixture = Fixture::fresh().await;
    let service = &fixture.service;
    let id = "00000000-0000-4000-8000-000000000000";
    let expected = ApiError::NotFound(format!("Account not found: {id}"));
    assert_eq!(service.approve(id.to_owned()).await.unwrap_err(), expected);
    assert_eq!(service.revoke(id.to_owned()).await.unwrap_err(), expected);
    assert_eq!(
        service.soft_delete(id.to_owned()).await.unwrap_err(),
        expected
    );
    assert_eq!(
        service.reactivate(id.to_owned()).await.unwrap_err(),
        expected
    );
    assert_eq!(
        service.set_expiry(id.to_owned(), None).await.unwrap_err(),
        expected
    );
    assert_eq!(
        service.delete_account(id.to_owned()).await.unwrap_err(),
        expected
    );
    fixture.close().await;
}
