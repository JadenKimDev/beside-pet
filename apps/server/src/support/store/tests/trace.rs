// 턴 분석의 추적 칸(trace jsonb): 있으면 문서로 적히고 같은 모양으로 읽히며, 없으면 NULL 이다. 값은 모두 지어낸 것이다.

use super::super::StoreError;
use super::{SessionsSchema, analysis, snapshot};
use crate::support::response::{TraceBlock, TurnTrace};
use crate::support::rules::{ActionKind, QuestionPolicy, TurnAnalysis, TurnStyleDecisions};

fn trace() -> TurnTrace {
    TurnTrace {
        prompt_version: "0.4.0".to_owned(),
        blocks: vec![
            TraceBlock {
                name: "identity".to_owned(),
                chars: 120,
            },
            TraceBlock {
                name: "turn_style".to_owned(),
                chars: 48,
            },
        ],
        turn_style: TurnStyleDecisions {
            question_policy: QuestionPolicy::Forbid,
            reassure_cooldown: true,
            ending_avoid: Some("네요.".to_owned()),
            stock_passed: vec!["made-up stock phrase".to_owned()],
            judge_line: false,
            short_rule: true,
            action_rule: vec![ActionKind::FeelingGuess, ActionKind::Permission],
        },
        system_prompt: "A made-up system prompt.\nTurn style line.".to_owned(),
    }
}

fn traced(at: i64) -> TurnAnalysis {
    TurnAnalysis {
        trace: Some(trace()),
        ..analysis(at, 2, 2, false)
    }
}

#[tokio::test]
async fn 추적은_문서로_적히고_없으면_null_이다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-traced", "owner-a", 0);
    snap.analyses = vec![traced(1), analysis(2, 2, 2, false)];
    store.save(&snap).await.unwrap();

    let written: Vec<(Option<String>, Option<String>, Option<i32>)> = sqlx::query_as(
        "SELECT trace->>'promptVersion', trace->'turnStyle'->>'questionPolicy', \
                jsonb_array_length(trace->'blocks') \
         FROM turn_analyses WHERE session_id = $1 ORDER BY seq",
    )
    .bind("s-traced")
    .fetch_all(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        written,
        vec![
            (Some("0.4.0".to_owned()), Some("forbid".to_owned()), Some(2)),
            (None, None, None),
        ]
    );
    let nulls: (i64,) = sqlx::query_as(
        "SELECT count(*) FROM turn_analyses WHERE session_id = $1 AND trace IS NULL",
    )
    .bind("s-traced")
    .fetch_one(&db.pool)
    .await
    .unwrap();
    assert_eq!(
        nulls.0, 1,
        "the untraced analysis is SQL NULL, not JSON null"
    );
    assert_eq!(store.find("s-traced").await.unwrap(), Some(snap));
    db.close().await;
}

#[tokio::test]
async fn 추적을_나중에_적은_스냅샷도_upsert_로_덮인다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-later", "owner-a", 0);
    snap.analyses = vec![analysis(1, 2, 2, false)];
    store.save(&snap).await.unwrap();
    snap.analyses[0] = traced(1);
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-later").await.unwrap(), Some(snap));
    db.close().await;
}

#[tokio::test]
async fn 모양이_틀린_추적은_읽기_오류다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-broken", "owner-a", 0);
    snap.analyses = vec![traced(1)];
    store.save(&snap).await.unwrap();
    sqlx::query("UPDATE turn_analyses SET trace = '{\"blocks\": 3}'::jsonb WHERE session_id = $1")
        .bind("s-broken")
        .execute(&db.pool)
        .await
        .unwrap();
    let found = store.find("s-broken").await;
    assert!(matches!(found, Err(StoreError::Database(_))), "{found:?}");
    db.close().await;
}
