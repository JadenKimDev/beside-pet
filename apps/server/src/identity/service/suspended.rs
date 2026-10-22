//! `SuspendedAccounts` 의 구현: 기동 파기가 고르는 보관 기간이 지난 정지 계정과 그 행 지우기를 `accounts` 저장에 잇는다.

use chrono::{DateTime, Utc};
use sqlx::PgPool;

use super::{BoxFuture, SharedSuspendedAccounts, SuspendedAccounts};
use crate::identity::rules::suspension_cutoff;
use crate::identity::store::AccountStore;
use crate::shared::ApiError;

/// `accounts` 저장 위의 `SuspendedAccounts`.
pub struct StoreSuspendedAccounts {
    store: AccountStore,
}

impl StoreSuspendedAccounts {
    pub(in crate::identity) fn new(store: AccountStore) -> StoreSuspendedAccounts {
        StoreSuspendedAccounts { store }
    }
}

/// 기동 파기가 쓰는 `SuspendedAccounts`. `app.rs` 가 풀로 만들어 넘긴다.
pub fn suspended_accounts(pool: PgPool) -> SharedSuspendedAccounts {
    std::sync::Arc::new(StoreSuspendedAccounts::new(AccountStore::new(pool)))
}

impl SuspendedAccounts for StoreSuspendedAccounts {
    fn suspended_before(
        &self,
        at: DateTime<Utc>,
        older_than_months: u32,
    ) -> BoxFuture<'_, Result<Vec<String>, ApiError>> {
        let cutoff = suspension_cutoff(at, older_than_months);
        Box::pin(async move {
            self.store
                .suspended_before(cutoff)
                .await
                .map_err(super::live::internal)
        })
    }

    fn delete_account_row<'a>(&'a self, id: &'a str) -> BoxFuture<'a, Result<bool, ApiError>> {
        Box::pin(async move { self.store.delete(id).await.map_err(super::live::internal) })
    }
}
