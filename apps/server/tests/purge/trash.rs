//! 지운 세션과 지운 리포트: 3개월이 지난 것만 파기하고 그 안의 것과 살아 있는 것은 남긴다.

use crate::db::TestSchema;
use crate::fixtures::{LONG_AGO, RECENT, memory, purge, rows_of, session};

#[tokio::test]
async fn sessions_deleted_over_three_months_ago_go_with_everything_they_hold() {
    let schema = TestSchema::open().await;
    session(
        &schema,
        "sess-old",
        "owner-t",
        &format!("'{LONG_AGO}'"),
        "NULL",
    )
    .await;
    memory(&schema, "sess-old", "owner-t").await;
    session(
        &schema,
        "sess-recent",
        "owner-t",
        &format!("'{RECENT}'"),
        "NULL",
    )
    .await;
    memory(&schema, "sess-recent", "owner-t").await;
    session(&schema, "sess-alive", "owner-t", "NULL", "NULL").await;

    let purged = purge(&schema).await;

    assert_eq!(purged.sessions, 1);
    assert_eq!(rows_of(&schema, "sess-old").await, [0; 7]);
    assert_eq!(rows_of(&schema, "sess-recent").await, [1; 7]);
    assert_eq!(rows_of(&schema, "sess-alive").await[..4], [1; 4]);
    schema.close().await;
}

#[tokio::test]
async fn reports_deleted_over_three_months_ago_are_emptied_and_recent_ones_stay() {
    let schema = TestSchema::open().await;
    session(
        &schema,
        "sess-r-old",
        "owner-r",
        "NULL",
        &format!("'{LONG_AGO}'"),
    )
    .await;
    session(
        &schema,
        "sess-r-recent",
        "owner-r",
        "NULL",
        &format!("'{RECENT}'"),
    )
    .await;
    session(&schema, "sess-r-alive", "owner-r", "NULL", "NULL").await;

    let purged = purge(&schema).await;

    assert_eq!(purged.reports, 1);
    let state = |id: &'static str| {
        let pool = schema.pool.clone();
        async move {
            sqlx::query_as::<_, (bool, bool)>(
                "SELECT report IS NULL, report_deleted_at IS NULL FROM sessions WHERE id = $1",
            )
            .bind(id)
            .fetch_one(&pool)
            .await
            .unwrap()
        }
    };
    assert_eq!(state("sess-r-old").await, (true, true));
    assert_eq!(state("sess-r-recent").await, (false, false));
    assert_eq!(state("sess-r-alive").await, (false, true));
    // 리포트만 비우고 세션과 전사는 남는다.
    assert_eq!(rows_of(&schema, "sess-r-old").await[..4], [1; 4]);
    schema.close().await;
}
