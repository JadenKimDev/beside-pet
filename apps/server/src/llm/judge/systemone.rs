//! systemone 판정기: HTTP `POST {base}/v1/systemone`(Laya, Kev, Jev 가 같은 모양)에 choice 질문 하나를 묻는다.
//! 요청·응답 모양은 `dev-tools/decision/src/decision/judges/systemone.py` 와 같다. 본문은 로그에 싣지 않는다.

use std::collections::BTreeMap;
use std::net::IpAddr;
use std::time::Duration;

use reqwest::{Client, Url};
use serde::ser::SerializeMap;
use serde::{Deserialize, Serialize, Serializer};

use super::question::{CRITERIA, INSTRUCTIONS, JUDGE_LABELS};
use super::{JudgeFailure, JudgeOutcome, JudgeRequest};

const PATH: &str = "/v1/systemone";

pub struct SystemOneJudge {
    client: Client,
    endpoint: String,
}

impl SystemOneJudge {
    /// `turn_analyses.reply_judge` 에 적는 이름.
    pub const NAME: &'static str = "systemone";

    /// `timeout` 은 요청 하나의 전체(연결부터 본문을 다 읽기까지) 제한이다. 주소가 루프백이 아니면
    /// 답 본문이 이 머신 밖으로 나가므로 경고 한 줄을 남긴다(막지는 않는다, ADR-0031).
    pub fn new(base_url: String, timeout: Duration) -> SystemOneJudge {
        if !is_loopback(&base_url) {
            tracing::warn!(
                host = host_of(&base_url).as_deref().unwrap_or("<unparseable>"),
                "SYSTEMONE_URL is not a loopback address; reply text will leave this machine"
            );
        }
        let base = base_url.trim_end_matches('/');
        let endpoint = if base.ends_with(PATH) {
            base.to_owned()
        } else {
            format!("{base}{PATH}")
        };
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .expect("the HTTP client for the reply judge must build");
        SystemOneJudge { client, endpoint }
    }

    pub async fn judge(&self, request: JudgeRequest) -> Result<JudgeOutcome, JudgeFailure> {
        let body = Body {
            state: State {
                user_turns: &request.user_turns,
                reply: &request.reply,
            },
            questions: Questions {
                kind: Question {
                    kind: "choice",
                    instructions: INSTRUCTIONS,
                    criteria: Criteria,
                },
            },
        };
        let response = self
            .client
            .post(&self.endpoint)
            .json(&body)
            .send()
            .await
            .map_err(failure_of)?;
        if !response.status().is_success() {
            tracing::warn!(
                status = response.status().as_u16(),
                "reply judge answered with an error status"
            );
            return Err(JudgeFailure::Unavailable);
        }
        let bytes = response.bytes().await.map_err(failure_of)?;
        let parsed: Response =
            serde_json::from_slice(&bytes).map_err(|_| JudgeFailure::BadResponse)?;
        outcome_of(parsed.answers.kind)
    }
}

/// 주소의 호스트가 루프백(127.0.0.0/8, ::1, localhost)인가. 읽지 못하는 주소는 루프백이 아니다.
pub(super) fn is_loopback(base_url: &str) -> bool {
    let Some(host) = host_of(base_url) else {
        return false;
    };
    if host.eq_ignore_ascii_case("localhost") {
        return true;
    }
    host.trim_start_matches('[')
        .trim_end_matches(']')
        .parse::<IpAddr>()
        .is_ok_and(|ip| ip.is_loopback())
}

fn host_of(base_url: &str) -> Option<String> {
    Url::parse(base_url).ok()?.host_str().map(str::to_owned)
}

fn failure_of(error: reqwest::Error) -> JudgeFailure {
    if error.is_timeout() {
        JudgeFailure::Timeout
    } else if error.is_decode() || error.is_body() {
        JudgeFailure::BadResponse
    } else {
        JudgeFailure::Unavailable
    }
}

fn outcome_of(answer: Answer) -> Result<JudgeOutcome, JudgeFailure> {
    let label = known_label(&answer.choice).ok_or(JudgeFailure::BadResponse)?;
    let probabilities = match answer.probabilities {
        None => None,
        Some(given) => {
            let mut kept = BTreeMap::new();
            for (key, value) in given {
                let Some(known) = known_label(&key) else {
                    continue;
                };
                if !(0.0..=1.0).contains(&value) {
                    return Err(JudgeFailure::BadResponse);
                }
                kept.insert(known, value as f32);
            }
            Some(kept)
        }
    };
    Ok(JudgeOutcome {
        label,
        probabilities,
    })
}

fn known_label(text: &str) -> Option<&'static str> {
    JUDGE_LABELS.into_iter().find(|label| *label == text)
}

#[derive(Serialize)]
struct Body<'a> {
    state: State<'a>,
    questions: Questions,
}

#[derive(Serialize)]
struct State<'a> {
    user_turns: &'a [String],
    reply: &'a str,
}

#[derive(Serialize)]
struct Questions {
    kind: Question,
}

#[derive(Serialize)]
struct Question {
    #[serde(rename = "type")]
    kind: &'static str,
    instructions: &'static str,
    criteria: Criteria,
}

/// `CRITERIA` 를 차례 그대로 객체로 싣는다.
struct Criteria;

impl Serialize for Criteria {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(CRITERIA.len()))?;
        for (label, text) in CRITERIA {
            map.serialize_entry(label, text)?;
        }
        map.end()
    }
}

#[derive(Deserialize)]
struct Response {
    answers: Answers,
}

#[derive(Deserialize)]
struct Answers {
    /// 질문의 이름(`kind`)으로 답이 온다.
    kind: Answer,
}

#[derive(Deserialize)]
struct Answer {
    choice: String,
    #[serde(default)]
    probabilities: Option<BTreeMap<String, f64>>,
}
