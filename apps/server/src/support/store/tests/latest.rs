// 직전 세션의 기준: 마지막 메시지 시각(없으면 시작 시각)이 가장 늦은 세션이다. 값은 모두 지어낸 것이다.

use super::super::super::response::MessageRole;
use super::{SessionsSchema, message, minute, snapshot};

#[tokio::test]
async fn 직전_세션은_시작이_아니라_마지막_메시지가_가장_늦은_세션이다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    // 먼저 시작했지만 나중까지 이야기한 세션.
    let mut long = snapshot("s-long", "owner-a", 0);
    long.history
        .push(message(MessageRole::User, "made-up late words", 2, 300));
    // 나중에 시작했지만 짧게 끝난 세션(마지막 메시지 분 102).
    let short = snapshot("s-short", "owner-a", 100);
    store.save(&long).await.unwrap();
    store.save(&short).await.unwrap();
    store
        .save(&snapshot("s-other", "owner-b", 900))
        .await
        .unwrap();

    let (latest, last_active_at) = store.latest_by_owner("owner-a").await.unwrap().unwrap();
    assert_eq!(latest, long);
    assert_eq!(last_active_at, minute(300));
    db.close().await;
}

#[tokio::test]
async fn 메시지가_없는_세션은_시작_시각으로_견준다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    let talked = snapshot("s-talked", "owner-a", 0); // 마지막 메시지 분 2
    let mut empty = snapshot("s-empty", "owner-a", 50);
    empty.history.clear();
    empty.analyses.clear();
    empty.turns.clear();
    store.save(&talked).await.unwrap();
    store.save(&empty).await.unwrap();

    let (latest, last_active_at) = store.latest_by_owner("owner-a").await.unwrap().unwrap();
    assert_eq!(latest, empty);
    assert_eq!(last_active_at, minute(50));

    // 빈 세션보다 늦게 말한 세션이 생기면 그쪽이다.
    let mut later = snapshot("s-later", "owner-a", 10);
    later
        .history
        .push(message(MessageRole::User, "made-up words", 2, 60));
    store.save(&later).await.unwrap();
    let (latest, last_active_at) = store.latest_by_owner("owner-a").await.unwrap().unwrap();
    assert_eq!(latest.id, "s-later");
    assert_eq!(last_active_at, minute(60));
    db.close().await;
}

#[tokio::test]
async fn 세션이_없으면_직전_세션도_없다() {
    let db = SessionsSchema::open().await;
    let store = db.store();
    store.save(&snapshot("s-1", "owner-a", 0)).await.unwrap();
    assert_eq!(store.latest_by_owner("owner-z").await.unwrap(), None);
    db.close().await;
}
