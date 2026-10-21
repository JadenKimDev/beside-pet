// 소유자 확인: 모든 세션 경로가 거친다. 남의 세션은 403, 관리자는 통과, 없는 세션은 404.

use super::doubles::{
    ENGAGED, Harness, SESSION_ID, admin, collect, message, onboarding, other, owner,
};
use crate::shared::ApiError;
use crate::support::SupportService;

fn forbidden() -> ApiError {
    ApiError::Forbidden("Not the owner of this session".to_owned())
}

#[tokio::test]
async fn 남의_세션은_모든_경로가_403_이다() {
    let h = Harness::new();
    h.onboard().await;
    let f = &h.flow;
    let r = other();

    assert_eq!(
        f.send(&r, SESSION_ID, message(ENGAGED)).await.err(),
        Some(forbidden())
    );
    assert_eq!(f.close(&r, SESSION_ID).await.err(), Some(forbidden()));
    assert_eq!(f.delete(&r, SESSION_ID).await.err(), Some(forbidden()));
    assert_eq!(f.state(&r, SESSION_ID).await.err(), Some(forbidden()));
    assert_eq!(f.history(&r, SESSION_ID).await.err(), Some(forbidden()));
    assert_eq!(f.analysis(&r, SESSION_ID).await.err(), Some(forbidden()));
    assert_eq!(f.report(&r, SESSION_ID).await.err(), Some(forbidden()));
    let events = collect(f.send_stream(r.clone(), SESSION_ID.to_owned(), message(ENGAGED))).await;
    assert_eq!(events, vec![Err(forbidden())]);
    assert!(h.sessions.get(SESSION_ID).is_some(), "nothing was deleted");
    assert!(!h.sessions.last_save().closed, "nothing was closed");
}

#[tokio::test]
async fn 관리자는_남의_세션도_본다() {
    let h = Harness::new();
    h.onboard().await;

    let state = h.flow.state(&admin(), SESSION_ID).await.unwrap();
    let history = h.flow.history(&admin(), SESSION_ID).await.unwrap();

    assert_eq!(state.session_id, SESSION_ID);
    assert_eq!(history.len(), 1);
}

#[tokio::test]
async fn 없는_세션은_404_다() {
    let h = Harness::new();
    let missing = || ApiError::NotFound("Session not found: nope".to_owned());

    assert_eq!(h.flow.state(&owner(), "nope").await.err(), Some(missing()));
    assert_eq!(h.flow.close(&owner(), "nope").await.err(), Some(missing()));
    assert_eq!(h.flow.delete(&owner(), "nope").await.err(), Some(missing()));
    assert_eq!(
        h.flow
            .send(&owner(), "nope", message(ENGAGED))
            .await
            .err(),
        Some(missing())
    );
}

#[tokio::test]
async fn 목록은_요청자의_세션만_최신순으로_20_개까지다() {
    let h = Harness::new();
    for index in 0..22 {
        h.flow
            .start(&owner(), onboarding(&format!("s-{index:02}")))
            .await
            .unwrap();
    }
    h.flow.start(&other(), onboarding("theirs")).await.unwrap();

    let items = h.flow.list(&owner()).await.unwrap();

    assert_eq!(items.len(), 20);
    assert_eq!(items[0].session_id, "s-21");
    assert_eq!(items[19].session_id, "s-02");
    assert!(items.iter().all(|item| item.session_id != "theirs"));
    assert_eq!(items[0].pet_name.as_deref(), Some("Biscuit"));
}

#[tokio::test]
async fn 목록_항목은_세션마다_메시지_집계를_갖는다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(ENGAGED).await;
    let snapshot = h.sessions.get(SESSION_ID).unwrap();
    let last = snapshot.history.last().unwrap().at;
    let first = snapshot.history.first().unwrap().at;

    let items = h.flow.list(&owner()).await.unwrap();

    assert_eq!(items.len(), 1);
    assert_eq!(items[0].message_count, 3, "인사, 답, 답글");
    assert_eq!(items[0].last_message_at, Some(last));
    assert_eq!(
        items[0].duration_minutes,
        Some(u32::try_from((last - first).num_minutes()).unwrap())
    );
}
