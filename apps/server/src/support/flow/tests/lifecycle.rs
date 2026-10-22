// 닫기(멱등), 삭제(보관함으로, 멱등)와 되살리기와 보관함 목록(ADR-0036), 질의(상태, 기록, 분석).

use chrono::Months;

use super::doubles::{
    ENGAGED, Harness, SESSION_ID, collect, deleted_at, message, onboarding, other, owner,
    reply_text,
};
use crate::shared::ApiError;
use crate::support::{MessageRole, SupportService};

fn missing() -> ApiError {
    ApiError::NotFound(format!("Session not found: {SESSION_ID}"))
}

fn forbidden() -> ApiError {
    ApiError::Forbidden("Not the owner of this session".to_owned())
}

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
async fn 삭제는_보관함으로_옮기고_행은_남으며_세션의_모든_경로가_404_다() {
    let h = Harness::new();
    h.onboard().await;

    h.flow.delete(&owner(), SESSION_ID).await.unwrap();

    assert!(
        h.sessions.get(SESSION_ID).is_some(),
        "the row stays until the purge"
    );
    assert!(h.sessions.is_deleted(SESSION_ID));
    let f = &h.flow;
    let o = owner();
    assert_eq!(f.state(&o, SESSION_ID).await.err(), Some(missing()));
    assert_eq!(f.history(&o, SESSION_ID).await.err(), Some(missing()));
    assert_eq!(f.analysis(&o, SESSION_ID).await.err(), Some(missing()));
    assert_eq!(f.report(&o, SESSION_ID).await.err(), Some(missing()));
    assert_eq!(f.close(&o, SESSION_ID).await.err(), Some(missing()));
    assert_eq!(
        f.send(&o, SESSION_ID, message(ENGAGED)).await.err(),
        Some(missing())
    );
    assert_eq!(f.delete_report(&o, SESSION_ID).await.err(), Some(missing()));
    assert_eq!(f.restore_report(&o, SESSION_ID).await.err(), Some(missing()));
    let events = collect(f.send_stream(o.clone(), SESSION_ID.to_owned(), message(ENGAGED))).await;
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].as_ref().err(), Some(&missing()));
    assert!(f.list(&o).await.unwrap().is_empty());
}

#[tokio::test]
async fn 지운_세션을_다시_지워도_204_다() {
    let h = Harness::new();
    h.onboard().await;

    h.flow.delete(&owner(), SESSION_ID).await.unwrap();
    h.flow.delete(&owner(), SESSION_ID).await.unwrap();

    assert!(h.sessions.is_deleted(SESSION_ID));
}

#[tokio::test]
async fn 남의_지운_세션은_지우기와_되살리기가_403_이고_없는_세션은_404_다() {
    let h = Harness::new();
    h.onboard().await;
    h.flow.delete(&owner(), SESSION_ID).await.unwrap();

    assert_eq!(
        h.flow.delete(&other(), SESSION_ID).await.err(),
        Some(forbidden())
    );
    assert_eq!(
        h.flow.restore(&other(), SESSION_ID).await.err(),
        Some(forbidden())
    );
    assert!(h.sessions.is_deleted(SESSION_ID));
    assert_eq!(
        h.flow.restore(&owner(), "nope").await.err(),
        Some(ApiError::NotFound("Session not found: nope".to_owned()))
    );
    assert_eq!(
        h.flow.delete(&owner(), "nope").await.err(),
        Some(ApiError::NotFound("Session not found: nope".to_owned()))
    );
}

#[tokio::test]
async fn 보관함은_내가_지운_세션만_지운_시각과_파기_시각과_함께_낸다() {
    let h = Harness::new();
    h.onboard().await;
    h.flow
        .start(&owner(), onboarding("s-2"))
        .await
        .expect("the second session starts");
    h.flow.delete(&owner(), SESSION_ID).await.unwrap();

    let trash = h.flow.list_deleted(&owner()).await.unwrap();

    assert_eq!(trash.len(), 1);
    let item = &trash[0];
    assert_eq!(item.session_id, SESSION_ID);
    assert_eq!(item.deleted_at, deleted_at());
    assert_eq!(item.purge_at, deleted_at() + Months::new(3));
    assert_eq!(item.pet_name.as_deref(), Some("Biscuit"));
    assert_eq!(item.started_at, h.sessions.get(SESSION_ID).unwrap().started_at);
    assert!(h.flow.list_deleted(&other()).await.unwrap().is_empty());
    let alive: Vec<String> = h
        .flow
        .list(&owner())
        .await
        .unwrap()
        .into_iter()
        .map(|item| item.session_id)
        .collect();
    assert_eq!(alive, vec!["s-2".to_owned()]);
}

#[tokio::test]
async fn 되살리면_목록과_조회에_돌아오고_보관함에서_빠진다() {
    let h = Harness::new();
    h.onboard().await;
    let before = h.flow.state(&owner(), SESSION_ID).await.unwrap();
    h.flow.delete(&owner(), SESSION_ID).await.unwrap();

    let restored = h.flow.restore(&owner(), SESSION_ID).await.unwrap();

    assert_eq!(restored, before);
    assert!(!h.sessions.is_deleted(SESSION_ID));
    assert_eq!(h.flow.state(&owner(), SESSION_ID).await.unwrap(), before);
    assert_eq!(h.flow.list(&owner()).await.unwrap().len(), 1);
    assert!(h.flow.list_deleted(&owner()).await.unwrap().is_empty());
}

#[tokio::test]
async fn 지우지_않은_세션을_되살리면_그대로_상태를_낸다() {
    let h = Harness::new();
    h.onboard().await;
    let before = h.flow.state(&owner(), SESSION_ID).await.unwrap();

    assert_eq!(h.flow.restore(&owner(), SESSION_ID).await.unwrap(), before);
    assert_eq!(
        h.flow.restore(&other(), SESSION_ID).await.err(),
        Some(forbidden())
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
