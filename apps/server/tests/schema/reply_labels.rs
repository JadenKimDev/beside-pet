//! 답의 상투성 판정 칸(`turn_analyses` 의 라벨, 확률, 판정기)과 날짜·라벨별 수를 세는 뷰 `daily_reply_labels`.

use sqlx::Row;

use crate::db::TestSchema;

/// 지어낸 판정 하나: 라벨, 그 라벨의 확률, 판정기.
type Judgement<'a> = (Option<&'a str>, Option<f32>, Option<&'a str>);

const NONE: Judgement<'static> = (None, None, None);

/// 지어낸 분석 행 하나를 넣는다.
async fn insert_analysis(
    schema: &TestSchema,
    seq: i32,
    at: &str,
    (label, probability, judge): Judgement<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO turn_analyses (session_id, seq, at, task, phase, risk_level, risk_detected_by, \
         from_task, to_task, advanced, retry_count, knowledge, reply_label, reply_label_probability, reply_judge) \
         VALUES ('sess-judge', $1, $2::timestamptz, 1, 'task', 0, 'none', 1, 1, false, 0, '[]', $3, $4, $5)",
    )
    .bind(seq)
    .bind(at)
    .bind(label)
    .bind(probability)
    .bind(judge)
    .execute(&schema.pool)
    .await
    .map(|_| ())
}

#[tokio::test]
async fn turn_analyses_has_three_nullable_judgement_columns() {
    let schema = TestSchema::open().await;
    let rows = sqlx::query(
        "SELECT column_name::text, data_type::text, is_nullable::text FROM information_schema.columns \
         WHERE table_schema = $1 AND table_name = 'turn_analyses' \
         AND column_name IN ('reply_label', 'reply_label_probability', 'reply_judge') \
         ORDER BY ordinal_position",
    )
    .bind(schema.name())
    .fetch_all(&schema.pool)
    .await
    .unwrap();
    let got: Vec<(String, String, String)> = rows
        .iter()
        .map(|r| (r.get(0), r.get(1), r.get(2)))
        .collect();
    let c = |n: &str, t: &str| (n.to_owned(), t.to_owned(), "YES".to_owned());
    assert_eq!(
        got,
        [
            c("reply_label", "character varying"),
            c("reply_label_probability", "real"),
            c("reply_judge", "character varying"),
        ]
    );
    schema.close().await;
}

#[tokio::test]
async fn reply_label_and_probability_are_checked() {
    let schema = TestSchema::open().await;
    let at = "2026-10-20T01:00:00Z";
    for (seq, judgement) in [
        (0, NONE),
        (1, (Some("generic_comfort"), Some(0.91), Some("haiku"))),
        (
            2,
            (Some("specific_reflection"), Some(0.0), Some("system-one")),
        ),
        (3, (Some("question"), Some(1.0), Some("haiku"))),
    ] {
        insert_analysis(&schema, seq, at, judgement)
            .await
            .unwrap_or_else(|e| panic!("{judgement:?} 가 들어가지 않았다: {e}"));
    }
    for (seq, judgement) in [
        (10, (Some("comfort"), Some(0.5), Some("haiku"))),
        (11, (Some(""), Some(0.5), Some("haiku"))),
        (12, (Some("question"), Some(1.01), Some("haiku"))),
        (13, (Some("question"), Some(-0.01), Some("haiku"))),
    ] {
        assert!(
            insert_analysis(&schema, seq, at, judgement).await.is_err(),
            "{judgement:?} 가 들어갔다"
        );
    }
    schema.close().await;
}

#[tokio::test]
async fn daily_reply_labels_counts_labels_by_utc_date_without_nulls() {
    let schema = TestSchema::open().await;
    let haiku = |label: &'static str, p: f32| (Some(label), Some(p), Some("haiku"));
    for (seq, at, judgement) in [
        (0, "2026-10-20T01:00:00Z", haiku("generic_comfort", 0.9)),
        (1, "2026-10-20T02:00:00Z", haiku("generic_comfort", 0.7)),
        // 서울 시각으로는 21일이지만 UTC 로는 20일이다.
        (2, "2026-10-20T23:30:00+00:00", haiku("question", 0.8)),
        // 판정이 없는 턴은 세지 않는다.
        (3, "2026-10-20T04:00:00Z", NONE),
        (
            4,
            "2026-10-21T00:00:00Z",
            (Some("specific_reflection"), Some(0.6), Some("system-one")),
        ),
    ] {
        insert_analysis(&schema, seq, at, judgement).await.unwrap();
    }
    let rows = sqlx::query(
        "SELECT date::text, reply_label::text, count FROM daily_reply_labels ORDER BY date, reply_label",
    )
    .fetch_all(&schema.pool)
    .await
    .unwrap();
    let got: Vec<(String, String, i64)> = rows
        .iter()
        .map(|r| (r.get(0), r.get(1), r.get(2)))
        .collect();
    let r = |d: &str, l: &str, n: i64| (d.to_owned(), l.to_owned(), n);
    assert_eq!(
        got,
        [
            r("2026-10-20", "generic_comfort", 2),
            r("2026-10-20", "question", 1),
            r("2026-10-21", "specific_reflection", 1),
        ]
    );
    schema.close().await;
}
