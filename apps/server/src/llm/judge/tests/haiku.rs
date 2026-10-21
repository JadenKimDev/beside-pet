use std::sync::{Arc, Mutex};

use futures_util::future::BoxFuture;
use futures_util::stream;

use super::{HARNESS_CRITERIA, HARNESS_INSTRUCTIONS, sample_request};
use crate::llm::judge::haiku::parse_choice;
use crate::llm::judge::{
    HaikuJudge, JUDGE_PROMPT_VERSION, JudgeFailure, JudgeOutcome, JudgeRequest,
};
use crate::llm::{CallPurpose, GenerationRequest, PromptRole, TextModel, TextStream};
use crate::shared::ApiError;

/// 정해 둔 글(또는 오류)을 돌려주고 받은 요청을 적어 두는 글 모델.
struct ScriptedModel {
    reply: Result<String, ApiError>,
    seen: Mutex<Vec<GenerationRequest>>,
}

impl ScriptedModel {
    fn new(reply: Result<&str, ApiError>) -> Arc<ScriptedModel> {
        Arc::new(ScriptedModel {
            reply: reply.map(str::to_owned),
            seen: Mutex::new(Vec::new()),
        })
    }

    fn only_request(&self) -> GenerationRequest {
        let seen = self.seen.lock().unwrap();
        assert_eq!(seen.len(), 1, "요청이 한 건이어야 한다");
        seen[0].clone()
    }
}

impl TextModel for ScriptedModel {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        self.seen.lock().unwrap().push(request);
        let reply = self.reply.clone();
        Box::pin(async move { reply })
    }

    fn stream(&self, _request: GenerationRequest) -> TextStream {
        Box::pin(stream::empty())
    }
}

async fn judge_with(reply: Result<&str, ApiError>) -> Result<JudgeOutcome, JudgeFailure> {
    HaikuJudge::new(ScriptedModel::new(reply))
        .judge(sample_request())
        .await
}

/// 평가 하네스의 `render_prompt` 가 지어낸 입력으로 만드는 글.
fn harness_prompt(turns: &str, reply: &str) -> String {
    let options = HARNESS_CRITERIA
        .iter()
        .map(|(label, text)| format!("- {label}: {text}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "{HARNESS_INSTRUCTIONS}\n\n옵션:\n{options}\n\nuser_turns:\n{turns}\n\nreply:\n{reply}\n\n옵션의 이름 하나만 답하라."
    )
}

#[tokio::test]
async fn 라벨_하나를_받아_확률_없이_낸다() {
    assert_eq!(
        judge_with(Ok("specific_reflection")).await,
        Ok(JudgeOutcome {
            label: "specific_reflection",
            probabilities: None,
        })
    );
    assert_eq!(
        judge_with(Ok(" `question`.\n")).await.map(|o| o.label),
        Ok("question")
    );
    assert_eq!(
        judge_with(Ok("이 답은 generic_comfort 에 가깝다"))
            .await
            .map(|o| o.label),
        Ok("generic_comfort")
    );
}

#[tokio::test]
async fn 라벨을_읽지_못하면_bad_response_다() {
    for text in [
        "",
        "잘 모르겠다",
        "question 또는 generic_comfort",
        "crisis_fixed",
        "generic_comfort_x",
        "Question",
    ] {
        assert_eq!(
            judge_with(Ok(text)).await,
            Err(JudgeFailure::BadResponse),
            "{text:?}"
        );
    }
}

#[tokio::test]
async fn 모델_호출이_실패하면_unavailable_이다() {
    assert_eq!(
        judge_with(Err(ApiError::Internal)).await,
        Err(JudgeFailure::Unavailable)
    );
}

#[tokio::test]
async fn 요청은_하네스의_프롬프트와_역할_judge_를_싣는다() {
    let model = ScriptedModel::new(Ok("question"));
    HaikuJudge::new(model.clone())
        .judge(sample_request())
        .await
        .unwrap();

    let request = model.only_request();
    assert_eq!(
        request.system.as_deref(),
        Some(
            "너는 분류기다. 반려동물을 떠나보낸 보호자와 동반자의 대화에서 동반자의 답(`reply`)이 어떤 성격인지 주어진 옵션 가운데 하나만 고른다. 답에는 옵션의 이름 하나만 쓴다. 설명, 따옴표, 마침표를 붙이지 않는다. 답에 여러 성격이 섞여 있으면 분량이 가장 큰 성격을 고른다. 보호자의 말을 되받는 문장이 하나뿐이고 그 뒤에 질문(괄호의 예시 포함)이 이어지면 question 이다. 되받는 문장이 둘 이상이면 specific_reflection 이다. 보호자가 말한 구체를 받지 않은 위로나 안심이 주면 generic_comfort 다. 첫 인사처럼 받을 말이 없으면 specific_reflection 이 아니다."
        )
    );
    assert_eq!(request.messages.len(), 1);
    assert_eq!(request.messages[0].role, PromptRole::User);
    assert_eq!(
        request.messages[0].text,
        harness_prompt("- 지어낸 첫 말\n- 지어낸 둘째 말 두 줄로", "지어낸 답 하나")
    );
    assert!(request.max_tokens <= 32, "{}", request.max_tokens);
    assert_eq!(request.context.purpose, CallPurpose::Judge);
    assert_eq!(request.context.purpose.as_str(), "judge");
    assert_eq!(request.context.prompt_version, JUDGE_PROMPT_VERSION);
    assert_eq!(request.context.session_id, None);
}

#[tokio::test]
async fn 직전_말이_없으면_없음이라고_적는다() {
    let model = ScriptedModel::new(Ok("generic_comfort"));
    let request = JudgeRequest {
        user_turns: Vec::new(),
        reply: "지어낸 첫 인사".to_owned(),
    };
    HaikuJudge::new(model.clone()).judge(request).await.unwrap();
    assert_eq!(
        model.only_request().messages[0].text,
        harness_prompt("(없음)", "지어낸 첫 인사")
    );
}

#[test]
fn 라벨_읽기는_하네스의_parse_choice_와_같다() {
    assert_eq!(parse_choice("question"), Some("question"));
    assert_eq!(parse_choice("'generic_comfort'。"), Some("generic_comfort"));
    assert_eq!(
        parse_choice("답: specific_reflection"),
        Some("specific_reflection")
    );
    assert_eq!(parse_choice("question question"), Some("question"));
    assert_eq!(parse_choice("question, specific_reflection"), None);
    assert_eq!(parse_choice("myquestion"), None);
    assert_eq!(parse_choice("question_mark"), None);
    assert_eq!(parse_choice(""), None);
}

#[test]
fn 판정기_이름과_버전() {
    assert_eq!(HaikuJudge::NAME, "haiku");
    assert_eq!(crate::llm::SystemOneJudge::NAME, "systemone");
    assert_eq!(JUDGE_PROMPT_VERSION, "0.1.0");
}
