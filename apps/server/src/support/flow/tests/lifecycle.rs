// 닫기(멱등), 삭제, 질의(상태, 기록, 분석).

use super::doubles::{ENGAGED, Harness, SESSION_ID, owner, reply_text};
use crate::shared::ApiError;
use crate::support::{MessageRole, SupportService};

#[tokio::test]
async fn 닫기는_멱등이고_닫힌_상태를_낸다() {
    let h = Harness::new();
    h.onboard().await;

    let first = h.flow.close(&owner(), SESSION_ID).await.unwrap();
    let saves = h.sessions.saves().len();
    let second = h.flow.close(&owner(), SESSION_ID).await.unwrap();

    assert!(first.closed && second.closed);
    assert_eq!(first, second);
    assert_eq!(
        h.sessions.saves().len(),
        saves,
        "closing a closed session writes nothing"
    );
    assert!(h.sessions.last_save().closed);
}

#[tokio::test]
async fn 삭제하면_세션이_사라진다() {
    let h = Harness::new();
    h.onboard().await;

    h.flow.delete(&owner(), SESSION_ID).await.unwrap();

    assert!(h.sessions.get(SESSION_ID).is_none());
    assert_eq!(
        h.flow.state(&owner(), SESSION_ID).await.err(),
        Some(ApiError::NotFound(format!(
            "Session not found: {SESSION_ID}"
        )))
    );
}

#[tokio::test]
async fn 기록과_분석은_전사를_돌려주고_요약은_닫혔을_때만_있다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(ENGAGED).await;

    let history = h.flow.history(&owner(), SESSION_ID).await.unwrap();
    let open = h.flow.analysis(&owner(), SESSION_ID).await.unwrap();
    h.flow.close(&owner(), SESSION_ID).await.unwrap();
    let closed = h.flow.analysis(&owner(), SESSION_ID).await.unwrap();

    let roles: Vec<MessageRole> = history.iter().map(|m| m.role).collect();
    assert_eq!(
        roles,
        vec![
            MessageRole::Assistant,
            MessageRole::User,
            MessageRole::Assistant
        ]
    );
    assert_eq!(history[2].text, reply_text());
    assert!(open.plan.is_some());
    assert!(open.summary.is_none());
    assert_eq!(open.analyses.len(), 1);
    assert!(closed.closed);
    assert!(closed.plan.is_some());
    assert!(closed.summary.is_some());
}
