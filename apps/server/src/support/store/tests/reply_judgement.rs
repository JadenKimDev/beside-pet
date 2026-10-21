// 턴 분석의 답 판정 칸(reply_label, reply_label_probability, reply_judge)과 뷰 daily_reply_labels. 값은 모두 지어낸 것이다.

use chrono::NaiveDate;

use super::{SessionsSchema, analysis, minute, snapshot};
use crate::support::ReplyLabel;
use crate::support::rules::{ReplyJudgement, TurnAnalysis};

fn judged(at: i64, label: ReplyLabel, probability: Option<f32>, judge: &str) -> TurnAnalysis {
    TurnAnalysis {
        reply: Some(ReplyJudgement {
            label,
            label_probability: probability,
            judge: judge.to_owned(),
        }),
        ..analysis(at, 2, 2, false)
    }
}

#[tokio::test]
async fn 판정은_세_칸에_적히고_없으면_null_이다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-judged", "owner-a", 0);
    snap.analyses = vec![
        judged(1, ReplyLabel::GenericComfort, Some(0.75), "systemone@0.1.0"),
        judged(2, ReplyLabel::Question, None, "haiku@0.1.0"),
        analysis(3, 2, 2, false),
    ];
    store.save(&snap).await.unwrap();

    let written: Vec<(Option<String>, Option<f32>, Option<String>)> = sqlx::query_as(
        "SELECT reply_label, reply_label_probability, reply_judge FROM turn_analyses \
         WHERE session_id = $1 ORDER BY seq",
    )
    .bind("s-judged")
    .fetch_all(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        written,
        vec![
            (
                Some("generic_comfort".to_owned()),
                Some(0.75),
                Some("systemone@0.1.0".to_owned())
            ),
            (
                Some("question".to_owned()),
                None,
                Some("haiku@0.1.0".to_owned())
            ),
            (None, None, None),
        ]
    );
    assert_eq!(store.find("s-judged").await.unwrap(), Some(snap.clone()));

    // 판정을 나중에 적은 스냅샷도 upsert 로 덮인다.
    snap.analyses[2] = judged(
        3,
        ReplyLabel::SpecificReflection,
        Some(0.5),
        "systemone@0.1.0",
    );
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-judged").await.unwrap(), Some(snap));
    db.close().await;
}

#[tokio::test]
async fn 모르는_라벨은_읽기_오류다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-unknown", "owner-a", 0);
    snap.analyses = vec![analysis(1, 2, 2, false)];
    store.save(&snap).await.unwrap();
    // 마이그레이션의 CHECK 를 우회해 다른 글을 넣는다.
    sqlx::query("ALTER TABLE turn_analyses DROP CONSTRAINT turn_analyses_reply_label_check")
        .execute(&db.pool)
        .await
        .unwrap();
    sqlx::query(
        "UPDATE turn_analyses SET reply_label = 'made_up', reply_judge = 'x' WHERE session_id = $1",
    )
    .bind("s-unknown")
    .execute(&db.pool)
    .await
    .unwrap();
    assert!(store.find("s-unknown").await.is_err());
    db.close().await;
}

#[tokio::test]
async fn 뷰는_utc_날짜와_라벨마다_판정을_세고_null_은_세지_않는다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut first = snapshot("s-view-1", "owner-a", 0);
    first.analyses = vec![
        judged(1, ReplyLabel::GenericComfort, Some(0.9), "systemone@0.1.0"),
        judged(2, ReplyLabel::GenericComfort, None, "haiku@0.1.0"),
        judged(3, ReplyLabel::Question, Some(0.6), "systemone@0.1.0"),
        analysis(4, 2, 2, false),
    ];
    let mut next_day = snapshot("s-view-2", "owner-b", 24 * 60);
    next_day.analyses = vec![
        judged(
            24 * 60 + 1,
            ReplyLabel::GenericComfort,
            Some(0.8),
            "systemone@0.1.0",
        ),
        analysis(24 * 60 + 2, 2, 2, false),
    ];
    store.save(&first).await.unwrap();
    store.save(&next_day).await.unwrap();

    let counted: Vec<(NaiveDate, String, i64)> = sqlx::query_as(
        "SELECT date, reply_label, count FROM daily_reply_labels ORDER BY date, reply_label",
    )
    .fetch_all(&db.pool)
    .await
    .unwrap();
    let day = minute(0).date_naive();
    let after = minute(24 * 60).date_naive();
    assert_eq!(
        counted,
        vec![
            (day, "generic_comfort".to_owned(), 2),
            (day, "question".to_owned(), 1),
            (after, "generic_comfort".to_owned(), 1),
        ]
    );
    db.close().await;
}
