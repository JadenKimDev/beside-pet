// 턴 경로 셋(ADR-0030)의 겉: 다시 붙기와 답 다시 받기는 SSE, 중단은 200 JSON, 서비스의 409·404 는 Nest 모양 그대로.

use std::sync::Arc;

use axum::http::{Method, StatusCode};
use serde_json::{Value, json};

use super::double::{CUT_TURN, Echo, GONE_TURN, app};
use super::{assert_sse, call};

fn frames(text: &str) -> Vec<Value> {
    text.split_terminator("\n\n")
        .map(|frame| serde_json::from_str(frame.strip_prefix("data: ").unwrap()).unwrap())
        .collect()
}

#[tokio::test]
async fn 다시_붙기는_요청자와_세션과_턴을_넘기는_sse_다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::GET,
        "/v1/sessions/s-3/turns/t-7/stream",
        Some("viewer"),
        None,
    )
    .await;
    assert_sse(&reply, "reattach acct-viewer/false s-3 t-7");
}

#[tokio::test]
async fn 답_다시_받기는_요청자와_세션과_턴을_넘기는_sse_다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::POST,
        "/v1/sessions/s-3/turns/t-7/retry",
        Some("admin"),
        None,
    )
    .await;
    assert_sse(&reply, "retry acct-admin/true s-3 t-7");
}

#[tokio::test]
async fn 중단은_200_이고_턴_id_와_cancelled_다() {
    let reply = call(
        app(Arc::new(Echo)),
        Method::POST,
        "/v1/sessions/s-3/turns/t-7/cancel",
        Some("viewer"),
        None,
    )
    .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        reply.json(),
        json!({ "turnId": "cancel acct-viewer/false s-3 t-7", "status": "cancelled" })
    );
}

#[tokio::test]
async fn 중단된_스트림은_마지막_프레임이_cancelled_다() {
    for (method, verb) in [(Method::GET, "stream"), (Method::POST, "retry")] {
        let path = format!("/v1/sessions/s-3/turns/{CUT_TURN}/{verb}");
        let reply = call(app(Arc::new(Echo)), method, &path, Some("viewer"), None).await;
        assert_eq!(reply.status, StatusCode::OK, "{path}");
        assert_eq!(
            frames(&reply.text),
            vec![
                json!({ "kind": "meta", "task": 1, "progress": 0.0, "supportLevel": 1, "done": false }),
                json!({ "kind": "cancelled" }),
            ],
            "{path}"
        );
    }
}

#[tokio::test]
async fn 첫_이벤트_전의_409_와_404_는_nest_모양이다() {
    let cases = [
        (Method::GET, "stream", GONE_TURN, 409, "Turn is not active"),
        (
            Method::POST,
            "cancel",
            GONE_TURN,
            409,
            "Turn already finished",
        ),
        (Method::POST, "retry", GONE_TURN, 409, "Turn is not failed"),
        (
            Method::POST,
            "cancel",
            "missing",
            404,
            "Turn not found: missing",
        ),
    ];
    for (method, verb, turn, status, message) in cases {
        let path = format!("/v1/sessions/s-3/turns/{turn}/{verb}");
        let reply = call(app(Arc::new(Echo)), method, &path, Some("viewer"), None).await;
        let error = if status == 409 {
            "Conflict"
        } else {
            "Not Found"
        };
        assert_eq!(reply.status.as_u16(), status, "{path}");
        assert_eq!(
            reply.json(),
            json!({ "statusCode": status, "message": message, "error": error }),
            "{path}"
        );
    }
}
