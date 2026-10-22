//! `/v1/admin/*`: 인증과 `admin` 역할(403), 상태 코드, 검증 문구, 경로의 id.

use axum::http::{Method, StatusCode};
use serde_json::json;

use super::{Harness, token};

/// 관리자 라우트 여덟(메서드, 경로, 본문).
const ROUTES: [(&str, &str, Option<&str>); 8] = [
    ("POST", "/v1/admin/accounts", Some("{}")),
    ("GET", "/v1/admin/accounts", None),
    ("POST", "/v1/admin/accounts/acc-7/approve", None),
    ("POST", "/v1/admin/accounts/acc-7/revoke", None),
    ("POST", "/v1/admin/accounts/acc-7/soft-delete", None),
    ("POST", "/v1/admin/accounts/acc-7/reactivate", None),
    (
        "PATCH",
        "/v1/admin/accounts/acc-7/expiry",
        Some(r#"{"expiresAt":"nope"}"#),
    ),
    ("DELETE", "/v1/admin/accounts/acc-7", None),
];

fn method(name: &str) -> Method {
    Method::from_bytes(name.as_bytes()).unwrap()
}

#[tokio::test]
async fn 관리자_라우트는_인증이_없으면_401_이다() {
    let h = Harness::new(false);
    for (name, uri, body) in ROUTES {
        let reply = h.send(method(name), uri, None, body).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{name} {uri}");
        assert_eq!(reply.body["message"], "Not authenticated", "{name} {uri}");
        let reply = h
            .send(method(name), uri, Some(&token("forged")), body)
            .await;
        assert_eq!(
            reply.body["message"], "Invalid or expired token",
            "{name} {uri}"
        );
    }
    assert!(h.calls().is_empty());
}

#[tokio::test]
async fn 관리자_라우트는_viewer_면_검증보다_먼저_403_이다() {
    let h = Harness::new(false);
    for (name, uri, body) in ROUTES {
        let reply = h
            .send(method(name), uri, Some(&token("viewer")), body)
            .await;
        assert_eq!(reply.status, StatusCode::FORBIDDEN, "{name} {uri}");
        assert_eq!(
            reply.body,
            json!({ "statusCode": 403, "message": "Insufficient role", "error": "Forbidden" }),
            "{name} {uri}"
        );
    }
    assert!(h.calls().is_empty());
}

#[tokio::test]
async fn 계정_발급은_201_이다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::POST,
            "/v1/admin/accounts",
            Some(&token("admin")),
            Some(
                r#"{"username":"maple","password":"longenough","company":"Acme Pets","role":"admin","expiresAt":"2026-12-31"}"#,
            ),
        )
        .await;
    assert_eq!(reply.status, StatusCode::CREATED);
    assert_eq!(reply.body["id"], "acc-made");
    assert_eq!(
        h.calls(),
        [
            r#"create_account CreateAccountInput { username: "maple", password: "longenough", company: "Acme Pets", role: Some(Admin), expires_at: Some("2026-12-31") }"#
        ]
    );
}

#[tokio::test]
async fn 계정_발급_검증_문구() {
    let h = Harness::new(false);
    let admin = token("admin");
    let reply = h
        .send(Method::POST, "/v1/admin/accounts", Some(&admin), Some("{}"))
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        reply.body["message"],
        json!([
            "username must be longer than or equal to 3 characters",
            "username must be a string",
            "password must be longer than or equal to 8 characters",
            "password must be a string",
            "company should not be empty",
            "company must be a string"
        ])
    );
    let reply = h
        .send(
            Method::POST,
            "/v1/admin/accounts",
            Some(&admin),
            Some(
                r#"{"username":"ab","password":"x","company":"","role":"root","expiresAt":"nope"}"#,
            ),
        )
        .await;
    assert_eq!(
        reply.body["message"],
        json!([
            "username must be longer than or equal to 3 characters",
            "password must be longer than or equal to 8 characters",
            "company should not be empty",
            "role must be one of the following values: admin, viewer",
            "expiresAt must be a valid ISO 8601 date string"
        ])
    );
    assert!(h.calls().is_empty());
}

#[tokio::test]
async fn 계정_목록은_배열이다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::GET,
            "/v1/admin/accounts",
            Some(&token("admin")),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    let ids: Vec<&str> = reply
        .body
        .as_array()
        .unwrap()
        .iter()
        .map(|a| a["id"].as_str().unwrap())
        .collect();
    assert_eq!(ids, ["a", "b"]);
    assert!(reply.body[0].get("expiresAt").is_none());
    assert_eq!(reply.body[1]["expiresAt"], "2027-01-02T03:04:05.000Z");
}

#[tokio::test]
async fn 계정_목록의_정지_시각은_있을_때만_칸이_있다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::GET,
            "/v1/admin/accounts",
            Some(&token("admin")),
            None,
        )
        .await;
    assert!(reply.body[0].get("deletedAt").is_none());
    assert_eq!(reply.body[1]["deletedAt"], "2026-10-17T09:00:00.250Z");
}

#[tokio::test]
async fn 정지와_되살리기의_응답에_정지_시각이_실린다() {
    let h = Harness::new(false);
    let admin = token("admin");
    let reply = h
        .send(
            Method::POST,
            "/v1/admin/accounts/acc-7/soft-delete",
            Some(&admin),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(reply.body["status"], "deleted");
    assert_eq!(reply.body["deletedAt"], "2026-10-20T01:02:03.456Z");
    let reply = h
        .send(
            Method::POST,
            "/v1/admin/accounts/acc-7/reactivate",
            Some(&admin),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert!(reply.body.get("deletedAt").is_none());
}

#[tokio::test]
async fn 정지_3개월_전의_계정_삭제는_409_다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::DELETE,
            "/v1/admin/accounts/acc-young",
            Some(&token("admin")),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(
        reply.body,
        json!({
            "statusCode": 409,
            "message": "Account must be suspended for 3 months before deletion",
            "error": "Conflict"
        })
    );
}

#[tokio::test]
async fn 계정_목록의_항목에_세션_수와_마지막_활동_시각이_붙는다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::GET,
            "/v1/admin/accounts",
            Some(&token("admin")),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        reply.body[0]["sessionCount"], 0,
        "세션이 없는 계정도 칸이 있다"
    );
    assert!(
        reply.body[0].get("lastActiveAt").is_none(),
        "메시지가 없으면 칸을 뺀다"
    );
    assert_eq!(reply.body[1]["sessionCount"], 2);
    assert_eq!(reply.body[1]["lastActiveAt"], "2026-10-18T12:34:56.789Z");
    // 기존 칸은 그대로다.
    assert_eq!(reply.body[1]["id"], "b");
    assert_eq!(reply.body[1]["username"], "maple");
    assert_eq!(reply.body[1]["lastLoginAt"], "2026-10-15T14:59:59.999Z");
}

#[tokio::test]
async fn 계정_목록의_활동은_한_번에_묻는다() {
    let h = Harness::new(false);
    h.send(
        Method::GET,
        "/v1/admin/accounts",
        Some(&token("admin")),
        None,
    )
    .await;
    assert_eq!(
        h.sessions.activity_asked(),
        vec![vec!["a".to_owned(), "b".to_owned()]]
    );
}

#[tokio::test]
async fn 상태_바꾸기_넷은_200_이고_경로의_id_로_부른다() {
    let h = Harness::new(false);
    for action in ["approve", "revoke", "soft-delete", "reactivate"] {
        let uri = format!("/v1/admin/accounts/acc-7/{action}");
        let reply = h
            .send(Method::POST, &uri, Some(&token("admin")), None)
            .await;
        assert_eq!(reply.status, StatusCode::OK, "{uri}");
        assert_eq!(reply.body["id"], "acc-7", "{uri}");
    }
    assert_eq!(
        h.calls(),
        [
            "approve acc-7",
            "revoke acc-7",
            "soft_delete acc-7",
            "reactivate acc-7"
        ]
    );
}

#[tokio::test]
async fn 만료_바꾸기는_200_이고_빈_칸은_지우기다() {
    let h = Harness::new(false);
    let admin = token("admin");
    let uri = "/v1/admin/accounts/acc-7/expiry";
    for body in [
        "{}",
        r#"{"expiresAt":null}"#,
        r#"{"expiresAt":"2027-03-01T00:00:00Z"}"#,
    ] {
        let reply = h.send(Method::PATCH, uri, Some(&admin), Some(body)).await;
        assert_eq!(reply.status, StatusCode::OK, "{body}");
    }
    assert_eq!(
        h.calls(),
        [
            "set_expiry acc-7 None",
            "set_expiry acc-7 None",
            r#"set_expiry acc-7 Some("2027-03-01T00:00:00Z")"#
        ]
    );
    let reply = h
        .send(
            Method::PATCH,
            uri,
            Some(&admin),
            Some(r#"{"expiresAt":"nope"}"#),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(
        reply.body["message"],
        json!(["expiresAt must be a valid ISO 8601 date string"])
    );
    let reply = h
        .send(Method::PATCH, uri, Some(&admin), Some(r#"{"zz":1}"#))
        .await;
    assert_eq!(
        reply.body["message"],
        json!(["property zz should not exist"])
    );
}

#[tokio::test]
async fn 계정_삭제는_204_이고_본문이_없다() {
    let h = Harness::new(false);
    let reply = h
        .send(
            Method::DELETE,
            "/v1/admin/accounts/acc-7",
            Some(&token("admin")),
            None,
        )
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert_eq!(reply.body, serde_json::Value::Null);
    assert_eq!(h.calls(), ["delete_account acc-7"]);
}
