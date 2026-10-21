use std::collections::BTreeMap;
use std::sync::Arc;
use std::time::Duration;

use futures_util::future::BoxFuture;
use futures_util::stream;

use super::{HaikuReplyJudge, SystemOneReplyJudge, error_of, judgement_of};
use crate::llm::{
    GenerationRequest, HaikuJudge, JUDGE_PROMPT_VERSION, JudgeFailure, JudgeOutcome,
    SystemOneJudge, TextModel, TextStream,
};
use crate::shared::ApiError;
use crate::support::flow::judge::{JudgeError, JudgeInput, Judgement, ReplyJudge, ReplyLabel};

/// 정해 둔 글만 돌려주는 글 모델.
struct FixedText(&'static str);

impl TextModel for FixedText {
    fn generate(&self, _request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        let text = self.0.to_owned();
        Box::pin(async move { Ok(text) })
    }

    fn stream(&self, _request: GenerationRequest) -> TextStream {
        Box::pin(stream::empty())
    }
}

fn input() -> JudgeInput {
    JudgeInput {
        recent_user: vec!["지어낸 말".to_owned()],
        reply: "지어낸 답".to_owned(),
        language: "ko".to_owned(),
    }
}

#[test]
fn 판정기의_답을_라벨과_확률로_옮긴다() {
    let outcome = JudgeOutcome {
        label: "generic_comfort",
        probabilities: Some(
            [
                ("generic_comfort", 0.7),
                ("specific_reflection", 0.2),
                ("question", 0.1),
            ]
            .into_iter()
            .collect(),
        ),
    };
    let expected: BTreeMap<ReplyLabel, f32> = [
        (ReplyLabel::GenericComfort, 0.7),
        (ReplyLabel::SpecificReflection, 0.2),
        (ReplyLabel::Question, 0.1),
    ]
    .into_iter()
    .collect();
    assert_eq!(
        judgement_of(outcome, "systemone"),
        Ok(Judgement {
            label: ReplyLabel::GenericComfort,
            probabilities: Some(expected),
            judge: "systemone",
            version: JUDGE_PROMPT_VERSION,
        })
    );
}

#[test]
fn 모르는_라벨은_bad_response_다() {
    let outcome = JudgeOutcome {
        label: "crisis_fixed",
        probabilities: None,
    };
    assert_eq!(judgement_of(outcome, "haiku"), Err(JudgeError::BadResponse));
}

#[test]
fn 실패의_종류를_그대로_옮긴다() {
    assert_eq!(error_of(JudgeFailure::Timeout), JudgeError::Timeout);
    assert_eq!(error_of(JudgeFailure::Unavailable), JudgeError::Unavailable);
    assert_eq!(error_of(JudgeFailure::BadResponse), JudgeError::BadResponse);
}

#[tokio::test]
async fn 글_모델_판정기는_확률_없는_판정을_낸다() {
    let judge = HaikuReplyJudge(HaikuJudge::new(Arc::new(FixedText("question"))));
    assert_eq!(
        judge.judge(input()).await,
        Ok(Some(Judgement {
            label: ReplyLabel::Question,
            probabilities: None,
            judge: "haiku",
            version: JUDGE_PROMPT_VERSION,
        }))
    );
    let judge = HaikuReplyJudge(HaikuJudge::new(Arc::new(FixedText("모름"))));
    assert_eq!(judge.judge(input()).await, Err(JudgeError::BadResponse));
}

#[tokio::test]
async fn 닿지_못한_systemone_은_unavailable_이다() {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();
    drop(listener);
    let judge = SystemOneReplyJudge(SystemOneJudge::new(
        format!("http://127.0.0.1:{port}"),
        Duration::from_secs(1),
    ));
    assert_eq!(judge.judge(input()).await, Err(JudgeError::Unavailable));
}
