use std::time::Duration;

use super::{ActiveStatus, ActiveTurns, AlreadyActive, SUBSCRIBER_BUFFER, TurnEvent};

const TURN: &str = "00000000-0000-4000-8000-000000000001";
const OTHER: &str = "00000000-0000-4000-8000-000000000002";

#[test]
fn register_rejects_a_turn_already_active() {
    let turns = ActiveTurns::default();
    let _handle = turns.register(TURN).expect("first register");
    assert!(matches!(turns.register(TURN), Err(AlreadyActive)));
    assert!(turns.register(OTHER).is_ok());
}

#[test]
fn register_is_shared_across_clones() {
    let turns = ActiveTurns::default();
    let other_view = turns.clone();
    let _handle = turns.register(TURN).expect("register");
    assert!(other_view.register(TURN).is_err());
    assert_eq!(
        other_view.snapshot(TURN),
        Some((ActiveStatus::Streaming, String::new()))
    );
}

#[test]
fn a_finished_turn_can_be_registered_again() {
    let turns = ActiveTurns::default();
    let _handle = turns.register(TURN).expect("register");
    turns.finish(TURN);
    assert!(turns.register(TURN).is_ok());
}

#[tokio::test]
async fn subscribe_gets_collected_text_then_later_chunks() {
    let turns = ActiveTurns::default();
    let _handle = turns.register(TURN).expect("register");
    assert!(turns.push(TURN, "안녕"));
    assert!(turns.push(TURN, "하세요"));

    let (text, mut events) = turns.subscribe(TURN).expect("active turn");
    assert_eq!(text, "안녕하세요");

    assert!(turns.push(TURN, ". 오늘"));
    turns.finish(TURN);
    assert_eq!(
        events.recv().await,
        Some(TurnEvent::Chunk(". 오늘".to_owned()))
    );
    assert_eq!(events.recv().await, Some(TurnEvent::Done));
    assert_eq!(events.recv().await, None);
}

#[test]
fn push_to_an_unknown_turn_is_refused() {
    let turns = ActiveTurns::default();
    assert!(!turns.push(TURN, "글"));
    assert_eq!(turns.snapshot(TURN), None);
}

#[test]
fn push_without_subscribers_does_not_block_and_collects() {
    let turns = ActiveTurns::default();
    let _handle = turns.register(TURN).expect("register");
    for _ in 0..(SUBSCRIBER_BUFFER * 4) {
        assert!(turns.push(TURN, "가"));
    }
    let (_, text) = turns.snapshot(TURN).expect("active");
    assert_eq!(text.chars().count(), SUBSCRIBER_BUFFER * 4);
}

#[tokio::test]
async fn a_lagging_subscriber_is_dropped_without_blocking_push() {
    let turns = ActiveTurns::default();
    let _handle = turns.register(TURN).expect("register");
    let (_, mut slow) = turns.subscribe(TURN).expect("active");
    for _ in 0..(SUBSCRIBER_BUFFER + 8) {
        assert!(turns.push(TURN, "가"));
    }
    // 버퍼를 넘긴 구독자는 끊긴 것으로 본다. 다시 붙으면 모은 글을 처음부터 받는다.
    assert_eq!(slow.recv().await, None);
    let (text, _) = turns.subscribe(TURN).expect("still active");
    assert_eq!(text.chars().count(), SUBSCRIBER_BUFFER + 8);
}

#[tokio::test]
async fn cancel_sends_cancelled_and_returns_text_idempotently() {
    let turns = ActiveTurns::default();
    let mut handle = turns.register(TURN).expect("register");
    let (_, mut events) = turns.subscribe(TURN).expect("active");
    assert!(turns.push(TURN, "부분 답"));
    assert!(!turns.is_cancelled(TURN));
    assert!(!handle.is_cancelled());

    assert_eq!(turns.cancel(TURN), Some("부분 답".to_owned()));
    assert_eq!(turns.cancel(TURN), Some("부분 답".to_owned()));
    assert!(turns.is_cancelled(TURN));
    assert!(handle.is_cancelled());
    tokio::time::timeout(Duration::from_secs(1), handle.cancelled())
        .await
        .expect("token fires");

    assert_eq!(
        events.recv().await,
        Some(TurnEvent::Chunk("부분 답".to_owned()))
    );
    assert_eq!(events.recv().await, Some(TurnEvent::Cancelled));

    // 중단 뒤의 조각은 모으지도 보내지도 않는다.
    assert!(!turns.push(TURN, " 더"));
    assert_eq!(
        turns.snapshot(TURN),
        Some((ActiveStatus::Cancelled, "부분 답".to_owned()))
    );

    // 끝낼 때 Done 을 따로 보내지 않는다. Cancelled 가 마지막 이벤트다.
    turns.finish(TURN);
    assert_eq!(events.recv().await, None);
}

#[tokio::test]
async fn subscribing_to_a_cancelled_turn_yields_cancelled_first() {
    let turns = ActiveTurns::default();
    let _handle = turns.register(TURN).expect("register");
    assert!(turns.push(TURN, "부분"));
    turns.cancel(TURN);
    let (text, mut events) = turns.subscribe(TURN).expect("still registered");
    assert_eq!(text, "부분");
    assert_eq!(events.recv().await, Some(TurnEvent::Cancelled));
}

#[test]
fn cancel_of_an_unknown_turn_is_none() {
    let turns = ActiveTurns::default();
    assert_eq!(turns.cancel(TURN), None);
    assert!(!turns.is_cancelled(TURN));
}

#[test]
fn finish_removes_the_turn() {
    let turns = ActiveTurns::default();
    let _handle = turns.register(TURN).expect("register");
    assert!(turns.push(TURN, "글"));
    turns.finish(TURN);
    assert!(turns.subscribe(TURN).is_none());
    assert_eq!(turns.snapshot(TURN), None);
    assert_eq!(turns.cancel(TURN), None);
    turns.finish(TURN);
}

#[tokio::test]
async fn handle_cancelled_resolves_when_turn_finishes_without_cancel() {
    let turns = ActiveTurns::default();
    let mut handle = turns.register(TURN).expect("register");
    turns.finish(TURN);
    assert!(!handle.is_cancelled());
    tokio::time::timeout(Duration::from_secs(1), handle.cancelled())
        .await
        .expect("does not hang after finish");
}
