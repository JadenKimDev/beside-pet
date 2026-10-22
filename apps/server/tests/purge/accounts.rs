//! 정지한 계정: 정지 3개월이 지난 계정은 세션·메시지·기억과 계정 행까지 지우고, 3개월 안이거나 정지 시각이 없는 계정은
//! 남긴다. 계정 완전 삭제가 쓰는 `owned_data_purger` 도 같은 연쇄를 거친다.

use beside_pet_server::support;

use crate::db::TestSchema;
use crate::fixtures::{LONG_AGO, RECENT, account, count, memory, purge, rows_of, session};

async fn account_rows(schema: &TestSchema, id: &str) -> i64 {
    count(
        schema,
        &format!("SELECT count(*) FROM accounts WHERE id = '{id}'"),
    )
    .await
}

#[tokio::test]
async fn accounts_suspended_over_three_months_ago_go_with_their_sessions_and_memory() {
    let schema = TestSchema::open().await;
    account(&schema, "acct-old", "deleted", &format!("'{LONG_AGO}'")).await;
    session(&schema, "sess-a-old-1", "acct-old", "NULL", "NULL").await;
    memory(&schema, "sess-a-old-1", "acct-old").await;
    session(
        &schema,
        "sess-a-old-2",
        "acct-old",
        &format!("'{RECENT}'"),
        "NULL",
    )
    .await;
    account(&schema, "acct-recent", "deleted", &format!("'{RECENT}'")).await;
    session(&schema, "sess-a-recent", "acct-recent", "NULL", "NULL").await;
    memory(&schema, "sess-a-recent", "acct-recent").await;
    account(&schema, "acct-null", "deleted", "NULL").await;
    session(&schema, "sess-a-null", "acct-null", "NULL", "NULL").await;
    account(&schema, "acct-active", "active", "NULL").await;
    session(&schema, "sess-a-active", "acct-active", "NULL", "NULL").await;

    let purged = purge(&schema).await;

    assert_eq!(purged.accounts, 1);
    assert_eq!(purged.account_sessions, 2);
    assert_eq!(account_rows(&schema, "acct-old").await, 0);
    assert_eq!(rows_of(&schema, "sess-a-old-1").await, [0; 7]);
    assert_eq!(rows_of(&schema, "sess-a-old-2").await, [0; 7]);
    for (acct, sess) in [
        ("acct-recent", "sess-a-recent"),
        ("acct-null", "sess-a-null"),
        ("acct-active", "sess-a-active"),
    ] {
        assert_eq!(account_rows(&schema, acct).await, 1, "{acct}");
        assert_eq!(rows_of(&schema, sess).await[..4], [1; 4], "{sess}");
    }
    assert_eq!(rows_of(&schema, "sess-a-recent").await, [1; 7]);
    schema.close().await;
}

#[tokio::test]
async fn the_owned_data_purger_deletes_every_session_and_memory_of_the_owner() {
    let schema = TestSchema::open().await;
    session(&schema, "sess-o-1", "acct-o", "NULL", "NULL").await;
    memory(&schema, "sess-o-1", "acct-o").await;
    session(
        &schema,
        "sess-o-2",
        "acct-o",
        &format!("'{RECENT}'"),
        "NULL",
    )
    .await;
    session(&schema, "sess-o-other", "acct-other", "NULL", "NULL").await;

    let deleted = support::owned_data_purger(schema.pool.clone())
        .delete_owned_by("acct-o")
        .await
        .unwrap();

    assert_eq!(deleted, 2);
    assert_eq!(rows_of(&schema, "sess-o-1").await, [0; 7]);
    assert_eq!(rows_of(&schema, "sess-o-2").await, [0; 7]);
    assert_eq!(rows_of(&schema, "sess-o-other").await[..4], [1; 4]);
    schema.close().await;
}
