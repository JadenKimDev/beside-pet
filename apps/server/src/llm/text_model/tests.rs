use futures_util::StreamExt;

use super::{GenerationRequest, PromptMessage, PromptRole, TextModel, Unimplemented};
use crate::shared::ApiError;

fn request() -> GenerationRequest {
    GenerationRequest {
        system: Some("be kind".to_owned()),
        messages: vec![PromptMessage {
            role: PromptRole::User,
            text: "hello".to_owned(),
        }],
        max_tokens: 16,
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
