// 위기 흐름(ADR-0004): 위기 발화는 발화 모델을 부르지 않고 고정 문구로 닫는다. 지원 수준은 3 이고 내려가지 않는다.

use super::doubles::{
    Harness, KEYWORD_CRISIS, QUIET_CRISIS, SESSION_ID, ScriptedModel, collect, joined_tokens, message,
    owner,
};
use crate::safety::crisis_reply;
use crate::shared::ApiError;
use crate::support::rules::SupportLevel;
use crate::support::{MessageRole, ReplyPhase, StreamEvent, SupportService};

#[tokio::test]
async fn 키워드_위기는_발화_모델을_부르지_않고_고정_문구로_닫는다() {
    let h = Harness::new();
    h.onboard().await;
    let replies_before = h.model.reply_calls();

    let turn = h.say(KEYWORD_CRISIS).await;

    assert_eq!(turn.reply, crisis_reply());
    assert!(turn.done);
    assert_eq!(turn.support_level, 3);
    assert_eq!(h.model.reply_calls(), replies_before);
    let saved = h.sessions.last_save();
    assert!(saved.closed);
    assert_eq!(saved.support_level, SupportLevel::Crisis);
    let last = saved.history.last().unwrap();
    assert_eq!(last.role, MessageRole::Assistant);
    assert_eq!(last.text, crisis_reply());
    let analysis = saved.analyses.last().unwrap();
    assert_eq!(analysis.phase, ReplyPhase::Closing);
    assert!(analysis.knowledge.is_empty());
    assert!(!analysis.transition.advanced);
}

#[tokio::test]
async fn 모델_판정만_위기여도_고정_문구로_닫는다() {
    let h = Harness::with_model(ScriptedModel::flagging());
    h.onboard().await;
    let replies_before = h.model.reply_calls();

    let turn = h.say(QUIET_CRISIS).await;

    assert_eq!(turn.reply, crisis_reply());
    assert!(turn.done);
    assert_eq!(turn.support_level, 3);
    assert_eq!(h.model.reply_calls(), replies_before);
}

#[tokio::test]
async fn 스트림의_위기는_meta_뒤_고정_문구_토큰_하나와_done_이다() {
    let h = Harness::new();
    h.onboard().await;
    let replies_before = h.model.reply_calls();

    let events = collect(h.flow.send_stream(
        owner(),
        SESSION_ID.to_owned(),
        message(KEYWORD_CRISIS),
    ))
    .await;

    assert_eq!(events.len(), 3, "{events:?}");
    match &events[0] {
        Ok(StreamEvent::Meta {
            support_level,
            done,
            ..
        }) => {
            assert_eq!(*support_level, 3);
            assert!(*done);
        }
        other => panic!("first event is meta: {other:?}"),
    }
    assert_eq!(joined_tokens(&events), crisis_reply());
    match &events[2] {
        Ok(StreamEvent::Done { result }) => {
            assert_eq!(result.reply, crisis_reply());
            assert!(result.done);
            assert_eq!(result.support_level, 3);
        }
        other => panic!("last event is done: {other:?}"),
    }
    assert_eq!(h.model.reply_calls(), replies_before);
    assert!(h.sessions.last_save().closed);
}

#[tokio::test]
async fn 위기로_닫힌_세션은_다음_턴을_409_로_거절하고_판정도_하지_않는다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(KEYWORD_CRISIS).await;
    let calls_before = h.model.calls().len();

    let refused = h
        .flow
        .send(&owner(), SESSION_ID, message("Are you still there?"))
        .await;

    assert_eq!(
        refused,
        Err(ApiError::Conflict(format!(
            "Session is already closed: {SESSION_ID}"
        )))
    );
    assert_eq!(h.model.calls().len(), calls_before);
}

#[tokio::test]
async fn 위기_뒤_지원_수준은_닫기와_조회에서_내려가지_않는다() {
    let h = Harness::new();
    h.onboard().await;
    h.say(KEYWORD_CRISIS).await;

    let closed = h.flow.close(&owner(), SESSION_ID).await.unwrap();
    let state = h.flow.state(&owner(), SESSION_ID).await.unwrap();

    assert_eq!(closed.support_level, 3);
    assert_eq!(state.support_level, 3);
    assert_eq!(h.sessions.last_save().support_level, SupportLevel::Crisis);
}
