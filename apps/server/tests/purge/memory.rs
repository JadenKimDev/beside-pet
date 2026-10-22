//! 기억 12개월 파기(ADR-0034)가 기동 파기 안에서 여전히 돈다: 마지막 대화가 12개월이 지난 계정의 기억은 지우고
//! 세션은 남긴다.

use crate::db::TestSchema;
use crate::fixtures::{memory, purge, rows_of, session};

#[tokio::test]
async fn memory_of_owners_silent_for_twelve_months_is_purged_but_sessions_stay() {
    let schema = TestSchema::open().await;
    session(&schema, "sess-m-stale", "owner-stale", "NULL", "NULL").await;
    memory(&schema, "sess-m-stale", "owner-stale").await;
    schema
        .exec("UPDATE sessions SET updated_at = '2025-09-01T00:00:00Z' WHERE id = 'sess-m-stale'")
        .await;
    session(&schema, "sess-m-fresh", "owner-fresh", "NULL", "NULL").await;
    memory(&schema, "sess-m-fresh", "owner-fresh").await;

    let purged = purge(&schema).await;

    assert_eq!(purged.memory, 3);
    assert_eq!(
        rows_of(&schema, "sess-m-stale").await,
        [1, 1, 1, 1, 0, 0, 0]
    );
    assert_eq!(rows_of(&schema, "sess-m-fresh").await, [1; 7]);
    schema.close().await;
}
