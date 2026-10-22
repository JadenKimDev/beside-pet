//! 정지 시각과 완전 삭제: 정지·되살리기의 시각, 3개월 가드(409), 바깥 연쇄 삭제 뒤 행 삭제, 기동 파기의 목록과 행 삭제.

use std::sync::{Arc, Mutex};

use chrono::{DateTime, Duration, TimeZone, Utc};

use super::{Fixture, fixed_now, register_input, suspension_required};
use crate::identity::RegisterInput;
use crate::identity::service::suspended::StoreSuspendedAccounts;
use crate::identity::{
    AccountService, AccountStatus, BoxFuture, OwnedDataPurger, SUSPENSION_HOLD_MONTHS,
    SuspendedAccounts,
};
use crate::shared::ApiError;

/// 지운 주인의 id 를 적어 두고, 정해 둔 답(지운 행 수 또는 오류)을 낸다.
struct FakePurger {
    answer: Result<u64, ApiError>,
    deleted: Mutex<Vec<String>>,
}

impl FakePurger {
    fn answering(answer: Result<u64, ApiError>) -> Arc<FakePurger> {
        Arc::new(FakePurger {
            answer,
            deleted: Mutex::new(Vec::new()),
        })
    }

    fn deleted(&self) -> Vec<String> {
        self.deleted.lock().unwrap().clone()
    }
}

impl OwnedDataPurger for FakePurger {
    fn delete_owned_by<'a>(&'a self, owner_id: &'a str) -> BoxFuture<'a, Result<u64, ApiError>> {
        self.deleted.lock().unwrap().push(owner_id.to_owned());
        let answer = self.answer.clone();
        Box::pin(async move { answer })
    }
}

/// `fixed_now` 에서 꼭 3개월 앞.
fn three_months_before_now() -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 7, 16, 9, 0, 0).unwrap()
}

/// `username` 으로 신청한 계정을 정지하고 그 정지 시각을 `deleted_at` 으로 바꿔 둔다(`None` 이면 마이그레이션 전 정지).
async fn suspended_at(
    fixture: &Fixture,
    username: &str,
    deleted_at: Option<DateTime<Utc>>,
) -> String {
    let input = RegisterInput {
        username: username.to_owned(),
        ..register_input()
    };
    let id = fixture.service.register(input).await.unwrap().id;
    fixture.service.soft_delete(id.clone()).await.unwrap();
    let store = fixture.schema.store();
    let mut record = store.find_by_id(&id).await.unwrap().unwrap();
    record.deleted_at = deleted_at;
    store.save(&record).await.unwrap();
    id
}

async fn exists(fixture: &Fixture, id: &str) -> bool {
    fixture
        .schema
        .store()
        .find_by_id(id)
        .await
        .unwrap()
        .is_some()
}

#[tokio::test]
async fn 정지하면_정지_시각이_적히고_되살리면_비워진다() {
    let fixture = Fixture::fresh().await;
    let service = &fixture.service;
    let id = service.register(register_input()).await.unwrap().id;

    let deleted = service.soft_delete(id.clone()).await.unwrap();
    assert_eq!(deleted.status, AccountStatus::Deleted);
    assert_eq!(deleted.deleted_at, Some(fixed_now()));
    let listed = service.list_accounts().await.unwrap();
    assert_eq!(listed[0].deleted_at, Some(fixed_now()));

    let revived = service.reactivate(id.clone()).await.unwrap();
    assert_eq!(revived.status, AccountStatus::Active);
    assert_eq!(revived.deleted_at, None);
    assert_eq!(service.list_accounts().await.unwrap()[0].deleted_at, None);
    fixture.close().await;
}

#[tokio::test]
async fn 정지_3개월_전의_완전_삭제는_409_이고_아무것도_지우지_않는다() {
    let mut fixture = Fixture::fresh().await;
    let purger = FakePurger::answering(Ok(5));
    fixture.service = fixture.service.with_owned_data(purger.clone());

    let active = fixture.service.register(register_input()).await.unwrap().id;
    let recent = suspended_at(&fixture, "rowan", Some(fixed_now() - Duration::days(30))).await;
    let exact = suspended_at(&fixture, "alder", Some(three_months_before_now())).await;
    let legacy = suspended_at(&fixture, "yew", None).await;
    for id in [&active, &recent, &exact, &legacy] {
        assert_eq!(
            fixture
                .service
                .delete_account(id.clone())
                .await
                .unwrap_err(),
            suspension_required()
        );
        assert!(exists(&fixture, id).await);
    }
    assert!(purger.deleted().is_empty());
    fixture.close().await;
}

#[tokio::test]
async fn 정지_3개월이_지나면_대화와_기억을_지운_뒤_계정_행을_지운다() {
    let mut fixture = Fixture::fresh().await;
    let purger = FakePurger::answering(Ok(7));
    fixture.service = fixture.service.with_owned_data(purger.clone());
    let id = suspended_at(
        &fixture,
        "oak",
        Some(three_months_before_now() - Duration::milliseconds(1)),
    )
    .await;

    fixture.service.delete_account(id.clone()).await.unwrap();
    assert_eq!(purger.deleted(), vec![id.clone()]);
    assert!(!exists(&fixture, &id).await);
    assert_eq!(
        fixture.service.me(id.clone()).await.unwrap_err(),
        ApiError::NotFound("Account not found".to_owned())
    );
    fixture.close().await;
}

#[tokio::test]
async fn 연쇄_삭제가_없거나_실패하면_계정_행은_남는다() {
    // 끼운 구현이 없으면 501
    let fixture = Fixture::fresh().await;
    let id = suspended_at(&fixture, "elm", Some(fixed_now() - Duration::days(100))).await;
    assert_eq!(
        fixture
            .service
            .delete_account(id.clone())
            .await
            .unwrap_err(),
        ApiError::NotImplemented
    );
    assert!(exists(&fixture, &id).await);
    fixture.close().await;

    // 연쇄 삭제가 실패하면 그 오류이고 행을 지우지 않는다
    let mut fixture = Fixture::fresh().await;
    let purger = FakePurger::answering(Err(ApiError::Internal));
    fixture.service = fixture.service.with_owned_data(purger.clone());
    let id = suspended_at(&fixture, "ash", Some(fixed_now() - Duration::days(100))).await;
    assert_eq!(
        fixture
            .service
            .delete_account(id.clone())
            .await
            .unwrap_err(),
        ApiError::Internal
    );
    assert_eq!(purger.deleted(), vec![id.clone()]);
    assert!(exists(&fixture, &id).await);
    fixture.close().await;
}

#[tokio::test]
async fn 기동_파기는_보관_기간이_지난_정지_계정을_고르고_행을_지운다() {
    let fixture = Fixture::fresh().await;
    let old = suspended_at(
        &fixture,
        "fir",
        Some(three_months_before_now() - Duration::seconds(1)),
    )
    .await;
    let store = fixture.schema.store();
    // 같은 아이디로 다시 신청할 수 없으니 두 번째부터는 아이디를 바꿔 넣는다.
    let mut recent = store.find_by_id(&old).await.unwrap().unwrap();
    recent.id = "acc-recent".to_owned();
    recent.username = "rowan".to_owned();
    recent.deleted_at = Some(three_months_before_now());
    store.save(&recent).await.unwrap();
    let mut legacy = recent.clone();
    legacy.id = "acc-legacy".to_owned();
    legacy.username = "alder".to_owned();
    legacy.deleted_at = None;
    store.save(&legacy).await.unwrap();

    let purge = StoreSuspendedAccounts::new(store);
    assert_eq!(
        purge
            .suspended_before(fixed_now(), SUSPENSION_HOLD_MONTHS)
            .await
            .unwrap(),
        vec![old.clone()]
    );
    assert!(purge.delete_account_row(&old).await.unwrap());
    assert!(!exists(&fixture, &old).await);
    assert!(!purge.delete_account_row(&old).await.unwrap());
    assert!(exists(&fixture, "acc-recent").await);
    assert!(exists(&fixture, "acc-legacy").await);
    fixture.close().await;
}
