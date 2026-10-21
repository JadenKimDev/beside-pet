// 흐르는 턴(streaming)과 중단한 턴(cancelled)의 저장, 숨은 메시지의 행, 기동 정리. 값은 모두 지어낸 것이다.

use super::{SessionsSchema, in_turn, message, minute, pending_turn, snapshot};
use crate::support::response::MessageRole;
use crate::support::session::{MessageActivity, Turn, TurnErrorKind, TurnStatus};

fn streaming_turn(session: &str, n: u8, started: i64) -> Turn {
    Turn {
        status: TurnStatus::Streaming,
        ..pending_turn(session, n, started)
    }
}

fn cancelled_turn(session: &str, n: u8, started: i64, finished: i64) -> Turn {
    Turn {
        status: TurnStatus::Cancelled,
        finished_at: Some(minute(finished)),
        ..pending_turn(session, n, started)
    }
}

#[tokio::test]
async fn 흐르는_턴과_중단한_턴과_부분_답이_그대로_되살아난다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-1", "owner-a", 0);
    snap.history.push(in_turn(
        message(MessageRole::User, "made-up stopped", 2, 5),
        "s-1",
        2,
    ));
    snap.turns.push(streaming_turn("s-1", 2, 5));
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap.clone()));

    // 중단: 부분 답을 그 턴으로 적고 턴은 cancelled.
    snap.history.push(in_turn(
        message(MessageRole::Assistant, "made-up half", 2, 6),
        "s-1",
        2,
    ));
    snap.turns[2] = cancelled_turn("s-1", 2, 5, 6);
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap.clone()));

    // 뒤에 턴이 더해져도 숨은 행은 남는다.
    snap.history.push(in_turn(
        message(MessageRole::User, "made-up next", 2, 7),
        "s-1",
        3,
    ));
    snap.turns.push(pending_turn("s-1", 3, 7));
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap));
    assert_eq!(db.rows_of("s-1").await, (1, 6, 2, 4));
    db.close().await;
}

#[tokio::test]
async fn 다시_받은_실패_턴은_pending_으로_덮이고_오류_종류가_비워진다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-1", "owner-a", 0);
    snap.history.push(in_turn(
        message(MessageRole::User, "made-up retry me", 2, 5),
        "s-1",
        2,
    ));
    snap.turns.push(Turn {
        status: TurnStatus::Failed,
        finished_at: Some(minute(6)),
        error_kind: Some(TurnErrorKind::Provider),
        ..pending_turn("s-1", 2, 5)
    });
    store.save(&snap).await.unwrap();
    snap.turns[2] = streaming_turn("s-1", 2, 5);
    store.save(&snap).await.unwrap();
    assert_eq!(store.find("s-1").await.unwrap(), Some(snap));
    db.close().await;
}

#[tokio::test]
async fn 기동_때_정리는_streaming_턴도_restart_실패로_닫고_중단한_턴은_그대로다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-a", "owner-a", 0);
    snap.turns.push(cancelled_turn("s-a", 2, 5, 6));
    snap.turns.push(streaming_turn("s-a", 3, 7));
    snap.turns.push(pending_turn("s-a", 4, 8));
    store.save(&snap).await.unwrap();

    let restarted = minute(60);
    assert_eq!(store.fail_pending_turns(restarted).await.unwrap(), 2);
    for turn in &mut snap.turns[3..] {
        *turn = Turn {
            status: TurnStatus::Failed,
            finished_at: Some(restarted),
            error_kind: Some(TurnErrorKind::Restart),
            ..turn.clone()
        };
    }
    assert_eq!(store.find("s-a").await.unwrap(), Some(snap));
    assert_eq!(store.fail_pending_turns(minute(61)).await.unwrap(), 0);
    db.close().await;
}

#[tokio::test]
async fn 메시지_집계는_중단한_턴의_메시지를_세지_않는다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let mut snap = snapshot("s-a", "owner-a", 0);
    let before = {
        store.save(&snap).await.unwrap();
        store.message_activity(&["s-a"]).await.unwrap()["s-a"]
    };
    snap.history.push(in_turn(
        message(MessageRole::User, "made-up hidden", 2, 50),
        "s-a",
        2,
    ));
    snap.history.push(in_turn(
        message(MessageRole::Assistant, "made-up hidden half", 2, 51),
        "s-a",
        2,
    ));
    snap.turns.push(cancelled_turn("s-a", 2, 50, 51));
    store.save(&snap).await.unwrap();
    let after: MessageActivity = store.message_activity(&["s-a"]).await.unwrap()["s-a"];
    assert_eq!(
        after, before,
        "숨은 메시지는 수, 마지막 시각, 길이에 들지 않는다"
    );
    db.close().await;
}
