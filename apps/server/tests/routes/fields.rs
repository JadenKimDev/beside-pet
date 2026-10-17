//! #15 에서 더한 응답 칸: 목록의 메시지 집계 셋, 리포트의 시작 시각과 감정 낱말. 없는 값은 칸이 빠진다.

use axum::http::{Method, StatusCode};
use serde_json::json;

use crate::harness::{Harness, Scripted};

#[tokio::test]
async fn 목록_항목은_마지막_시각과_분과_메시지_수를_싣는다() {
    let h = Harness::new(Scripted);
    let reply = h
        .send(Method::GET, "/v1/sessions", Some("viewer"), None)
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    let busy = &reply.body[0];
    assert_eq!(busy["lastMessageAt"], json!("2026-10-16T09:42:30.250Z"));
    assert_eq!(busy["durationMinutes"], json!(42));
    assert_eq!(busy["messageCount"], json!(9));
    assert_eq!(busy["startedAt"], json!("2026-10-16T09:00:00.000Z"));

    let quiet = reply.body[1].as_object().unwrap();
    assert_eq!(quiet["messageCount"], json!(0));
    assert!(!quiet.contains_key("lastMessageAt"), "{quiet:?}");
    assert!(!quiet.contains_key("durationMinutes"), "{quiet:?}");
}

#[tokio::test]
async fn 리포트는_시작_시각과_emotions_의_tags_를_싣는다() {
    let h = Harness::new(Scripted);
    let reply = h
        .send(
            Method::GET,
            "/v1/sessions/s-busy/report",
            Some("viewer"),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body["startedAt"], json!("2026-10-16T09:00:00.000Z"));
    assert_eq!(reply.body["at"], json!("2026-10-16T10:00:00.000Z"));
    let sections = reply.body["sections"].as_array().unwrap();
    assert!(sections[0].get("tags").is_none());
    assert_eq!(sections[1]["key"], json!("emotions"));
    assert_eq!(sections[1]["tags"], json!(["그리움", "고마움"]));
}
