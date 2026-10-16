// 위기 판정의 합집합과 폴백. 모델은 고정 답이나 실패를 내는 더블이다. 문장은 모두 지어낸 것이다.

use std::sync::Mutex;

use futures_util::future::BoxFuture;
use futures_util::stream;

use super::{RISK_SYSTEM_PROMPT, RiskLevel, assess_risk};
use crate::llm::{GenerationRequest, PromptMessage, PromptRole, TextModel, TextStream};
use crate::shared::ApiError;

/// 정해 둔 답(또는 실패)을 내고 받은 요청을 적어 두는 모델.
struct FixedModel {
    answer: Result<String, ApiError>,
    requests: Mutex<Vec<GenerationRequest>>,
}

impl FixedModel {
    fn answering(text: &str) -> FixedModel {
        FixedModel {
            answer: Ok(text.to_owned()),
            requests: Mutex::new(Vec::new()),
        }
    }

    fn failing() -> FixedModel {
        FixedModel {
            answer: Err(ApiError::Internal),
            requests: Mutex::new(Vec::new()),
        }
    }

    fn requests(&self) -> Vec<GenerationRequest> {
        self.requests.lock().unwrap().clone()
    }
}

impl TextModel for FixedModel {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        self.requests.lock().unwrap().push(request);
        let answer = self.answer.clone();
        Box::pin(async move { answer })
    }

    fn stream(&self, _request: GenerationRequest) -> TextStream {
        Box::pin(stream::once(async { Err::<String, _>(ApiError::Internal) }))
    }
}

const KEYWORD_TEXT: &str = "Since Bori died I just want to die.";
const PLAIN_TEXT: &str = "I miss walking Bori in the park every morning.";

#[tokio::test]
async fn 키워드가_걸리면_모델에_묻지_않고_위기다() {
    let model = FixedModel::answering("NO");
    assert_eq!(assess_risk(KEYWORD_TEXT, &model).await, RiskLevel::Crisis);
    assert!(model.requests().is_empty());
}

#[tokio::test]
async fn 키워드가_걸리면_모델이_실패해도_위기다() {
    let model = FixedModel::failing();
    assert_eq!(assess_risk(KEYWORD_TEXT, &model).await, RiskLevel::Crisis);
}

#[tokio::test]
async fn 키워드가_없어도_모델이_yes_면_위기다() {
    for answer in ["YES", " yes\n", "Yes."] {
        let model = FixedModel::answering(answer);
        assert_eq!(
            assess_risk("사라지고 싶다는 생각만 든다", &model).await,
            RiskLevel::Crisis,
            "{answer:?}"
        );
    }
}

#[tokio::test]
async fn 키워드도_없고_모델이_no_면_안전하다() {
    let model = FixedModel::answering("NO");
    assert_eq!(assess_risk(PLAIN_TEXT, &model).await, RiskLevel::Safe);
}

#[tokio::test]
async fn 모델이_실패하면_키워드_결과를_쓴다() {
    let model = FixedModel::failing();
    assert_eq!(assess_risk(PLAIN_TEXT, &model).await, RiskLevel::Safe);
    assert_eq!(model.requests().len(), 1);
}

#[tokio::test]
async fn 모델에는_판정_프롬프트와_사용자_글_하나를_작은_상한으로_보낸다() {
    let model = FixedModel::answering("NO");
    assess_risk(PLAIN_TEXT, &model).await;
    assert_eq!(
        model.requests(),
        vec![GenerationRequest {
            system: Some(RISK_SYSTEM_PROMPT.to_owned()),
            messages: vec![PromptMessage {
                role: PromptRole::User,
                text: PLAIN_TEXT.to_owned(),
            }],
            max_tokens: 5,
        }]
    );
}

#[test]
fn 판정_프롬프트는_ts_의_risk_prompt_와_같다() {
    assert!(RISK_SYSTEM_PROMPT.starts_with(
        "You are a safety classifier for a pet-loss grief support chat. Decide whether"
    ));
    assert!(
        RISK_SYSTEM_PROMPT
            .contains("(e.g. \"I miss them so much I could die\") are NOT risk. If there is")
    );
    assert!(RISK_SYSTEM_PROMPT.ends_with("Reply with exactly one word: YES or NO."));
}
