// 위기 판정의 합집합과 폴백. 모델은 고정 답이나 실패를 내는 더블이다. 문장은 모두 지어낸 것이다.

use std::sync::Mutex;

use futures_util::future::BoxFuture;
use futures_util::stream;

use super::{
    PROMPT_VERSION, RISK_SYSTEM_PROMPT, RiskDetector, RiskLevel, RiskVerdict, assess_risk_verdict,
};
use crate::llm::{
    CallContext, CallPurpose, GenerationRequest, PromptMessage, PromptRole, TextModel, TextStream,
};
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
const SESSION: Option<&str> = Some("session-fake");
const PLAIN_TEXT: &str = "I miss walking Bori in the park every morning.";

#[tokio::test]
async fn 키워드가_걸리면_모델에_묻지_않고_위기다() {
    let model = FixedModel::answering("NO");
    assert_eq!(
        assess_risk_verdict(KEYWORD_TEXT, None, SESSION, &model)
            .await
            .level,
        RiskLevel::Crisis
    );
    assert!(model.requests().is_empty());
}

#[tokio::test]
async fn 키워드가_걸리면_모델이_실패해도_위기다() {
    let model = FixedModel::failing();
    assert_eq!(
        assess_risk_verdict(KEYWORD_TEXT, None, SESSION, &model)
            .await
            .level,
        RiskLevel::Crisis
    );
}

#[tokio::test]
async fn 키워드가_없어도_모델이_yes_면_위기다() {
    for answer in ["YES", " yes\n", "Yes."] {
        let model = FixedModel::answering(answer);
        assert_eq!(
            assess_risk_verdict("사라지고 싶다는 생각만 든다", None, SESSION, &model)
                .await
                .level,
            RiskLevel::Crisis,
            "{answer:?}"
        );
    }
}

#[tokio::test]
async fn 키워드도_없고_모델이_no_면_안전하다() {
    let model = FixedModel::answering("NO");
    assert_eq!(
        assess_risk_verdict(PLAIN_TEXT, None, SESSION, &model)
            .await
            .level,
        RiskLevel::Safe
    );
}

#[tokio::test]
async fn 모델이_실패하면_키워드_결과를_쓴다() {
    let model = FixedModel::failing();
    assert_eq!(
        assess_risk_verdict(PLAIN_TEXT, None, SESSION, &model)
            .await
            .level,
        RiskLevel::Safe
    );
    assert_eq!(model.requests().len(), 1);
}

#[tokio::test]
async fn 모델에는_판정_프롬프트와_사용자_글_하나를_작은_상한으로_보낸다() {
    let model = FixedModel::answering("NO");
    assess_risk_verdict(PLAIN_TEXT, None, SESSION, &model).await;
    assert_eq!(
        model.requests(),
        vec![GenerationRequest {
            system: Some(RISK_SYSTEM_PROMPT.to_owned()),
            messages: vec![PromptMessage {
                role: PromptRole::User,
                text: format!("User message: {PLAIN_TEXT}"),
            }],
            max_tokens: 5,
            context: CallContext {
                purpose: CallPurpose::Crisis,
                prompt_version: PROMPT_VERSION,
                session_id: Some("session-fake".to_owned()),
            },
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

#[test]
fn 판정_프롬프트의_버전은_1_0_0_이다() {
    assert_eq!(PROMPT_VERSION, "1.0.0");
}

#[tokio::test]
async fn 세션이_없는_판정은_세션_없이_묻는다() {
    let model = FixedModel::answering("NO");
    assess_risk_verdict(PLAIN_TEXT, None, None, &model).await;
    assert_eq!(model.requests()[0].context.session_id, None);
}

// 판정의 감지 주체: 누가 위기를 잡았는가(키워드, 모델), 아무도 안 잡았는가.

fn verdict(level: RiskLevel, detector: RiskDetector) -> RiskVerdict {
    RiskVerdict { level, detector }
}

#[tokio::test]
async fn 키워드가_걸리면_주체는_키워드이고_모델에_묻지_않는다() {
    let model = FixedModel::answering("YES");
    assert_eq!(
        assess_risk_verdict(KEYWORD_TEXT, None, SESSION, &model).await,
        verdict(RiskLevel::Crisis, RiskDetector::Keyword)
    );
    assert!(model.requests().is_empty());
}

#[tokio::test]
async fn 키워드가_없고_모델이_yes_면_주체는_모델이다() {
    let model = FixedModel::answering(" yes\n");
    assert_eq!(
        assess_risk_verdict("사라지고 싶다는 생각만 든다", None, SESSION, &model).await,
        verdict(RiskLevel::Crisis, RiskDetector::Model)
    );
    assert_eq!(model.requests().len(), 1);
}

#[tokio::test]
async fn 키워드도_모델도_아니면_안전하고_주체는_없다() {
    let model = FixedModel::answering("NO");
    assert_eq!(
        assess_risk_verdict(PLAIN_TEXT, None, SESSION, &model).await,
        verdict(RiskLevel::Safe, RiskDetector::None)
    );
}

#[tokio::test]
async fn 모델이_실패하면_키워드_결과로_대신하고_주체는_없다() {
    let model = FixedModel::failing();
    assert_eq!(
        assess_risk_verdict(PLAIN_TEXT, None, SESSION, &model).await,
        verdict(RiskLevel::Safe, RiskDetector::None)
    );
    assert_eq!(model.requests().len(), 1);
}

#[tokio::test]
async fn 키워드가_걸리면_모델이_실패해도_주체는_키워드다() {
    let model = FixedModel::failing();
    assert_eq!(
        assess_risk_verdict(KEYWORD_TEXT, None, SESSION, &model).await,
        verdict(RiskLevel::Crisis, RiskDetector::Keyword)
    );
}

// 판정 입력의 직전 동반자 답(#48): 맥락 한 줄을 사용자 메시지 앞에 둔다. 판정 대상은 사용자 메시지다.

const PREVIOUS_REPLY: &str = "Bori sounds like she loved those mornings with you.";

#[tokio::test]
async fn 직전_답이_있으면_그_한_줄을_사용자_메시지_앞에_둔다() {
    let model = FixedModel::answering("NO");
    assess_risk_verdict(PLAIN_TEXT, Some(PREVIOUS_REPLY), SESSION, &model).await;
    let requests = model.requests();
    assert_eq!(requests.len(), 1);
    assert_eq!(
        requests[0].messages,
        vec![PromptMessage {
            role: PromptRole::User,
            text: format!(
                "Previous companion message: {PREVIOUS_REPLY}\nUser message: {PLAIN_TEXT}"
            ),
        }]
    );
}

#[tokio::test]
async fn 첫_턴이면_직전_답_줄_없이_사용자_메시지만_보낸다() {
    let model = FixedModel::answering("NO");
    assess_risk_verdict(PLAIN_TEXT, None, SESSION, &model).await;
    let text = &model.requests()[0].messages[0].text;
    assert_eq!(text, &format!("User message: {PLAIN_TEXT}"));
    assert!(!text.contains("Previous companion message"));
}

#[tokio::test]
async fn 여러_줄의_직전_답은_한_줄로_접는다() {
    let model = FixedModel::answering("NO");
    assess_risk_verdict(
        PLAIN_TEXT,
        Some("I'm here.\n\nTell me  more."),
        SESSION,
        &model,
    )
    .await;
    assert_eq!(
        model.requests()[0].messages[0].text,
        format!("Previous companion message: I'm here. Tell me more.\nUser message: {PLAIN_TEXT}")
    );
}

#[tokio::test]
async fn 직전_답이_있어도_키워드가_걸리면_모델에_묻지_않는다() {
    let model = FixedModel::answering("NO");
    assert_eq!(
        assess_risk_verdict(KEYWORD_TEXT, Some(PREVIOUS_REPLY), SESSION, &model).await,
        verdict(RiskLevel::Crisis, RiskDetector::Keyword)
    );
    assert!(model.requests().is_empty());
}

#[tokio::test]
async fn 직전_답이_있어도_모델이_실패하면_키워드_결과로_대신한다() {
    let model = FixedModel::failing();
    assert_eq!(
        assess_risk_verdict(PLAIN_TEXT, Some(PREVIOUS_REPLY), SESSION, &model).await,
        verdict(RiskLevel::Safe, RiskDetector::None)
    );
}

#[test]
fn 지시문은_직전_답을_맥락으로만_쓰고_판정_대상은_사용자_메시지라고_말한다() {
    assert!(RISK_SYSTEM_PROMPT.contains("Previous companion message"));
    assert!(RISK_SYSTEM_PROMPT.contains("context only"));
    assert!(RISK_SYSTEM_PROMPT.contains("Judge only the User message"));
}

#[test]
fn 지시문은_대화를_끝내려는_말이_위기가_아니라고_예시와_함께_말한다() {
    assert!(RISK_SYSTEM_PROMPT.contains("ending the conversation"));
    for example in ["그만할래", "여기까지 할게요", "이제 갈게요", "I need to go"] {
        assert!(RISK_SYSTEM_PROMPT.contains(example), "{example}");
    }
}

#[test]
fn 지시문은_한국어_위기_예시와_애도_관용구_예시를_담는다() {
    for example in [
        "따라가고 싶다",
        "죽고 싶다",
        "살 이유가 없다",
        "사라지고 싶다",
    ] {
        assert!(RISK_SYSTEM_PROMPT.contains(example), "{example}");
    }
    assert!(RISK_SYSTEM_PROMPT.contains("죽을 만큼 보고 싶다"));
}
