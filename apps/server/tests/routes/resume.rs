//! 턴의 다시 붙기·중단·답 다시 받기(#20, ADR-0030)를 조립한 라우터와 실제 대화 흐름, 테스트 스키마로 끝까지 돌린다. 모델만 대본이다.
//! 상태 응답의 `activeTurn`·`failedTurn`, 기록 응답에서 중단한 턴이 빠지는 것, 409·404·403 의 문구를 본다.
//! DATABASE_URL 이 없으면 이유를 적고 실패한다(건너뛰지 않는다). 아이디, 비밀번호, 글은 모두 지어낸 값이다.

use std::sync::atomic::Ordering;
use std::time::Duration;

use axum::http::{Method, StatusCode};
use serde_json::{Value, json};

use crate::harness::Reply;
use crate::turns::{FAILED_TURN_ID, Fixture, SESSION, TURN_ID, WORDS, account_token, fixture};

const UNKNOWN_TURN: &str = "7b2e4c91-0d3a-4f68-9e15-b8c6a2d0f437";

fn turn_path(turn_id: &str, verb: &str) -> String {
    format!("/v1/sessions/{SESSION}/turns/{turn_id}/{verb}")
}

fn frames(reply: &Reply) -> Vec<Value> {
    reply
        .text
        .split_terminator("\n\n")
        .map(|frame| serde_json::from_str(frame.strip_prefix("data: ").unwrap()).unwrap())
        .collect()
}

fn kinds(frames: &[Value]) -> Vec<&str> {
    frames.iter().map(|f| f["kind"].as_str().unwrap()).collect()
}

fn conflict(message: &str) -> Value {
    json!({ "statusCode": 409, "message": message, "error": "Conflict" })
}

impl Fixture {
    async fn on_turn(&self, method: Method, turn_id: &str, verb: &str) -> Reply {
        self.h
            .send(method, &turn_path(turn_id, verb), Some(&self.token), None)
            .await
    }

    async fn state(&self) -> Value {
        let reply = self
            .h
            .send(
                Method::GET,
                &format!("/v1/sessions/{SESSION}"),
                Some(&self.token),
                None,
            )
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
        reply.body
    }

    /// 상태 응답의 `activeTurn` 이 `streaming` 이 될 때까지 기다린다(답의 시작이 저장됐다).
    async fn wait_streaming(&self) -> Value {
        for _ in 0..200 {
            let state = self.state().await;
            if state["activeTurn"]["status"] == json!("streaming") {
                return state;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!(
            "activeTurn 이 streaming 이 되지 않았다: {}",
            self.state().await
        );
    }
}

#[tokio::test]
async fn 남의_세션의_턴_경로_셋은_403_이다() {
    let f = fixture().await;
    let other = account_token(&f.h, &f.schema, "finch-fixture", "fixture-pass-other").await;

    for (method, verb) in [
        (Method::GET, "stream"),
        (Method::POST, "cancel"),
        (Method::POST, "retry"),
    ] {
        let reply =
            f.h.send(method, &turn_path(TURN_ID, verb), Some(&other), None)
                .await;
        assert_eq!(
            reply.status,
            StatusCode::FORBIDDEN,
            "{verb}: {}",
            reply.text
        );
        assert_eq!(
            reply.body,
            json!({ "statusCode": 403, "message": "Not the owner of this session", "error": "Forbidden" }),
            "{verb}"
        );
    }
    f.schema.close().await;
}

#[tokio::test]
async fn 없는_턴은_404_이다() {
    let f = fixture().await;

    for (method, verb) in [
        (Method::GET, "stream"),
        (Method::POST, "cancel"),
        (Method::POST, "retry"),
    ] {
        let reply = f.on_turn(method, UNKNOWN_TURN, verb).await;
        assert_eq!(
            reply.status,
            StatusCode::NOT_FOUND,
            "{verb}: {}",
            reply.text
        );
        assert_eq!(
            reply.body,
            json!({ "statusCode": 404, "message": format!("Turn not found: {UNKNOWN_TURN}"), "error": "Not Found" }),
            "{verb}"
        );
    }
    f.schema.close().await;
}

#[tokio::test]
async fn 실패한_턴은_상태에_failed_turn_으로_보이고_답_다시_받기로_끝난다() {
    let f = fixture().await;
    f.model.fail.store(true, Ordering::SeqCst);
    let reply = f
        .say(json!({ "text": WORDS, "turnId": FAILED_TURN_ID }))
        .await;
    assert_eq!(reply.status, StatusCode::INTERNAL_SERVER_ERROR);

    let state = f.state().await;
    assert_eq!(state["failedTurn"], json!({ "turnId": FAILED_TURN_ID }));
    assert!(state.get("activeTurn").is_none(), "{state}");
    let reply = f.on_turn(Method::GET, FAILED_TURN_ID, "stream").await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.body, conflict("Turn is not active"));
    let reply = f.on_turn(Method::POST, FAILED_TURN_ID, "cancel").await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.body, conflict("Turn already finished"));

    f.model.fail.store(false, Ordering::SeqCst);
    let reply = f.on_turn(Method::POST, FAILED_TURN_ID, "retry").await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    assert_eq!(
        reply.headers["content-type"],
        "text/event-stream; charset=utf-8"
    );
    let retried = frames(&reply);
    assert_eq!(kinds(&retried).first(), Some(&"meta"));
    assert_eq!(kinds(&retried).last(), Some(&"done"));
    let state = f.state().await;
    assert!(state.get("failedTurn").is_none(), "{state}");
    assert!(state.get("activeTurn").is_none(), "{state}");
    let users = f
        .count(
            "SELECT count(*) FROM messages WHERE turn_id = $1 AND role = 'user'",
            FAILED_TURN_ID,
        )
        .await;
    assert_eq!(users, 1);

    // 끝난 턴: 다시 받기는 409, 다시 붙으면 meta → 답 전체 → done.
    let reply = f.on_turn(Method::POST, FAILED_TURN_ID, "retry").await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.body, conflict("Turn is not failed"));
    let reply = f.on_turn(Method::GET, FAILED_TURN_ID, "stream").await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    let again = frames(&reply);
    assert_eq!(kinds(&again), ["meta", "token", "done"]);
    assert_eq!(again[1]["text"], again[2]["result"]["reply"]);
    assert_eq!(again[2]["result"], retried.last().unwrap()["result"]);
    let reply = f.on_turn(Method::POST, FAILED_TURN_ID, "cancel").await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.body, conflict("Turn already finished"));
    f.schema.close().await;
}

#[tokio::test]
async fn 흐르는_답을_중단하면_두_스트림이_cancelled_로_끝나고_기록에서_빠진다() {
    let f = fixture().await;
    let before = f.state().await;
    let history_before = f.history().await;
    f.model.hold.store(true, Ordering::SeqCst);

    let (h, token) = (f.h.clone(), f.token.clone());
    let sender = tokio::spawn(async move {
        h.send(
            Method::POST,
            &format!("/v1/sessions/{SESSION}/messages/stream"),
            Some(&token),
            Some(json!({ "text": WORDS, "turnId": TURN_ID })),
        )
        .await
    });
    let state = f.wait_streaming().await;
    assert_eq!(state["activeTurn"]["turnId"], json!(TURN_ID));
    let (h, token) = (f.h.clone(), f.token.clone());
    let watcher = tokio::spawn(async move {
        h.send(
            Method::GET,
            &turn_path(TURN_ID, "stream"),
            Some(&token),
            None,
        )
        .await
    });
    // 첫 조각이 모이고 다시 붙은 쪽이 구독할 틈.
    tokio::time::sleep(Duration::from_millis(300)).await;

    let reply = f.on_turn(Method::POST, TURN_ID, "cancel").await;
    assert_eq!(reply.status, StatusCode::OK, "{}", reply.text);
    assert_eq!(
        reply.body,
        json!({ "turnId": TURN_ID, "status": "cancelled" })
    );

    for (name, task) in [("sender", sender), ("watcher", watcher)] {
        let reply = tokio::time::timeout(Duration::from_secs(10), task)
            .await
            .unwrap_or_else(|_| panic!("{name} 가 끝나지 않았다"))
            .unwrap();
        assert_eq!(reply.status, StatusCode::OK, "{name}: {}", reply.text);
        let sent = frames(&reply);
        assert_eq!(kinds(&sent).first(), Some(&"meta"), "{name}");
        assert_eq!(sent.last(), Some(&json!({ "kind": "cancelled" })), "{name}");
        assert!(!kinds(&sent).contains(&"done"), "{name}");
    }

    // 저장은 남고(사용자 말과 부분 답), 기록 응답에서는 빠지며, 세션 상태는 그대로다.
    let rows = f
        .count("SELECT count(*) FROM messages WHERE turn_id = $1", TURN_ID)
        .await;
    assert_eq!(rows, 2);
    let cancelled = f
        .count(
            "SELECT count(*) FROM turns WHERE id = $1 AND status = 'cancelled'",
            TURN_ID,
        )
        .await;
    assert_eq!(cancelled, 1);
    let history = f.history().await;
    assert_eq!(history, history_before);
    assert!(history.iter().all(|m| m["turnId"] != json!(TURN_ID)));
    let after = f.state().await;
    assert_eq!(after, before);

    // 중단은 멱등이고, 중단한 턴에는 붙지도 다시 받지도 못한다.
    let reply = f.on_turn(Method::POST, TURN_ID, "cancel").await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        reply.body,
        json!({ "turnId": TURN_ID, "status": "cancelled" })
    );
    let reply = f.on_turn(Method::GET, TURN_ID, "stream").await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.body, conflict("Turn is not active"));
    let reply = f.on_turn(Method::POST, TURN_ID, "retry").await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(reply.body, conflict("Turn is not failed"));
    f.schema.close().await;
}
