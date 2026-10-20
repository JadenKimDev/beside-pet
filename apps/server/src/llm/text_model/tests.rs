use futures_util::StreamExt;

use super::{
    CallContext, CallPurpose, GenerationRequest, PromptMessage, PromptRole, TextModel,
    Unimplemented,
};
use crate::shared::ApiError;

fn request() -> GenerationRequest {
    GenerationRequest {
        system: Some("be kind".to_owned()),
        messages: vec![PromptMessage {
            role: PromptRole::User,
            text: "hello".to_owned(),
        }],
        max_tokens: 16,
        context: CallContext {
            purpose: CallPurpose::Reply,
            prompt_version: "0.1.0",
            session_id: None,
        },
    }
}

#[tokio::test]
async fn 빈_구현의_generate_는_501_이다() {
    assert_eq!(
        Unimplemented.generate(request()).await,
        Err(ApiError::NotImplemented)
    );
}

#[tokio::test]
async fn 빈_구현의_stream_은_501_하나를_흘리고_끝난다() {
    let items: Vec<_> = Unimplemented.stream(request()).collect().await;
    assert_eq!(items, vec![Err(ApiError::NotImplemented)]);
}

#[test]
fn 호출_역할은_reply_crisis_report_낱말이다() {
    assert_eq!(CallPurpose::Reply.as_str(), "reply");
    assert_eq!(CallPurpose::Crisis.as_str(), "crisis");
    assert_eq!(CallPurpose::Report.as_str(), "report");
}
