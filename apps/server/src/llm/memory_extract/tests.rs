//! 기억 추출 테스트. 글 모델은 정해 둔 글(또는 오류)을 돌려주는 더블이고, 두 경로(Anthropic, Claude Code)의 요청 모양은
//! 라우터와 실제 공급자를 테스트 안의 가짜 HTTP 서버(127.0.0.1 임의 포트)와 가짜 `claude` 실행 파일에 붙여 본다. 본문은 지어냈다.

mod fake_http;
mod paths;

use std::sync::{Arc, Mutex};

use futures_util::future::BoxFuture;
use futures_util::stream;
use serde_json::Value;

use super::parse::parse_extraction;
use super::prompt::{SYSTEM_PROMPT, output_schema, user_prompt};
use super::{
    ExtractFailure, ExtractedMemory, KnownFact, KnownPet, MEMORY_EXTRACT_PROMPT_VERSION,
    MemoryExtract, MemoryExtractRequest, MemoryFact,
};
use crate::llm::{CallPurpose, GenerationRequest, OutputSchema, PromptRole, TextModel, TextStream};
use crate::shared::ApiError;

const KINDS: [&str; 7] = [
    "pet",
    "person",
    "object",
    "place",
    "date",
    "ritual",
    "preference",
];

/// 지어낸 입력: 떠난 아이 하나, 곁의 아이 하나, 알려진 사실 둘, 이번 발화.
fn sample_request() -> MemoryExtractRequest {
    MemoryExtractRequest {
        kinds: KINDS.to_vec(),
        pets: vec![
            KnownPet {
                name: "보리".to_owned(),
                status: "deceased",
            },
            KnownPet {
                name: "콩이".to_owned(),
                status: "living",
            },
        ],
        facts: vec![
            KnownFact {
                kind: "object",
                pet_name: Some("보리".to_owned()),
                text: "보리는 파란 공을 좋아했다".to_owned(),
            },
            KnownFact {
                kind: "person",
                pet_name: None,
                text: "언니와 함께 산다".to_owned(),
            },
        ],
        utterance: "사실 공은 빨간색이었어요. 매일 저녁 한강에 갔어요".to_owned(),
        seq: 9,
        language: "ko".to_owned(),
        session_id: Some("session-fake-1".to_owned()),
    }
}

const GOOD_JSON: &str = r#"{"facts":[{"kind":"object","pet_name":"보리","text":"보리는 빨간 공을 좋아했다","seq":9,"supersedes":[1]},{"kind":"place","pet_name":null,"text":"매일 저녁 한강에 갔다","seq":9,"supersedes":[]}],"do_not_remember":false}"#;

fn good_extraction() -> ExtractedMemory {
    ExtractedMemory {
        facts: vec![
            MemoryFact {
                kind: "object".to_owned(),
                pet_name: Some("보리".to_owned()),
                text: "보리는 빨간 공을 좋아했다".to_owned(),
                seq: 9,
                supersedes: vec![1],
            },
            MemoryFact {
                kind: "place".to_owned(),
                pet_name: None,
                text: "매일 저녁 한강에 갔다".to_owned(),
                seq: 9,
                supersedes: Vec::new(),
            },
        ],
        do_not_remember: false,
    }
}

/// 받은 요청과 어느 메서드로 왔는지, 스키마를 적어 두는 글 모델.
struct ScriptedModel {
    reply: Result<String, ApiError>,
    seen: Mutex<Vec<(GenerationRequest, Option<OutputSchema>)>>,
}

impl ScriptedModel {
    fn new(reply: Result<&str, ApiError>) -> Arc<ScriptedModel> {
        Arc::new(ScriptedModel {
            reply: reply.map(str::to_owned),
            seen: Mutex::new(Vec::new()),
        })
    }

    fn only_call(&self) -> (GenerationRequest, Option<OutputSchema>) {
        let seen = self.seen.lock().unwrap();
        assert_eq!(seen.len(), 1, "호출이 한 건이어야 한다");
        seen[0].clone()
    }
}

impl TextModel for ScriptedModel {
    fn generate(&self, request: GenerationRequest) -> BoxFuture<'_, Result<String, ApiError>> {
        self.seen.lock().unwrap().push((request, None));
        let reply = self.reply.clone();
        Box::pin(async move { reply })
    }

    fn generate_structured(
        &self,
        request: GenerationRequest,
        schema: OutputSchema,
    ) -> BoxFuture<'_, Result<String, ApiError>> {
        self.seen.lock().unwrap().push((request, Some(schema)));
        let reply = self.reply.clone();
        Box::pin(async move { reply })
    }

    fn stream(&self, _request: GenerationRequest) -> TextStream {
        Box::pin(stream::empty())
    }
}

async fn extract_with(reply: Result<&str, ApiError>) -> Result<ExtractedMemory, ExtractFailure> {
    MemoryExtract::new(ScriptedModel::new(reply))
        .extract(sample_request())
        .await
}

#[test]
fn 정상인_답을_읽는다() {
    assert_eq!(parse_extraction(GOOD_JSON), Some(good_extraction()));
    assert_eq!(
        parse_extraction(r#"{"facts":[],"do_not_remember":true}"#),
        Some(ExtractedMemory {
            facts: Vec::new(),
            do_not_remember: true,
        })
    );
}

#[test]
fn 읽지_못하는_답은_none_이다() {
    for text in [
        "",
        "I could not find any facts.",
        r#"{"facts":[{"kind":"pet","pet_name":null,"text":"잘린"#,
        r#"{"facts":[{"kind":"pet","pet_name":null,"text":"t","seq":"9","supersedes":[]}],"do_not_remember":false}"#,
        r#"{"facts":[{"kind":"pet","pet_name":null,"text":"t","seq":9,"supersedes":1}],"do_not_remember":false}"#,
        r#"{"facts":[{"kind":"pet","pet_name":null,"text":"t","seq":9,"supersedes_seq":1}],"do_not_remember":false}"#,
        r#"{"facts":[]}"#,
        r#"[{"kind":"pet"}]"#,
    ] {
        assert_eq!(parse_extraction(text), None, "{text:?}");
    }
}

#[tokio::test]
async fn 읽지_못한_답은_빈_추출이다() {
    for text in ["", "sorry", "```json\n{\"facts\": [\n```"] {
        assert_eq!(
            extract_with(Ok(text)).await,
            Ok(ExtractedMemory::default()),
            "{text:?}"
        );
    }
}

#[tokio::test]
async fn 호출이_실패하면_종류만_낸다() {
    assert_eq!(
        extract_with(Err(ApiError::Internal)).await,
        Err(ExtractFailure::Unavailable)
    );
    assert_eq!(
        extract_with(Err(ApiError::ModelTimeout)).await,
        Err(ExtractFailure::Timeout)
    );
}

#[tokio::test]
async fn 요청은_스키마와_역할_memory_extract_를_싣는다() {
    let model = ScriptedModel::new(Ok(GOOD_JSON));
    MemoryExtract::new(model.clone())
        .extract(sample_request())
        .await
        .unwrap();

    let (request, schema) = model.only_call();
    let schema = schema.expect("스키마를 실은 호출이어야 한다");
    assert_eq!(schema.0, output_schema(&KINDS));
    assert_eq!(request.system.as_deref(), Some(SYSTEM_PROMPT));
    assert_eq!(request.messages.len(), 1, "동반자의 말은 넣지 않는다");
    assert_eq!(request.messages[0].role, PromptRole::User);
    assert_eq!(request.messages[0].text, user_prompt(&sample_request()));
    assert!(request.max_tokens >= 512, "{}", request.max_tokens);
    assert_eq!(request.context.purpose, CallPurpose::MemoryExtract);
    assert_eq!(request.context.purpose.as_str(), "memory_extract");
    assert_eq!(
        request.context.prompt_version,
        MEMORY_EXTRACT_PROMPT_VERSION
    );
    assert_eq!(
        request.context.session_id.as_deref(),
        Some("session-fake-1")
    );
}

#[test]
fn 입력_글에_언어_아이_seq_붙은_사실_발화가_있다() {
    let text = user_prompt(&sample_request());
    for needle in [
        "ko",
        "보리 (deceased)",
        "콩이 (living)",
        "[1] object (보리): 보리는 파란 공을 좋아했다",
        "[2] person: 언니와 함께 산다",
        "seq 9",
        "사실 공은 빨간색이었어요. 매일 저녁 한강에 갔어요",
    ] {
        assert!(text.contains(needle), "{needle:?} 가 없다:\n{text}");
    }
}

#[test]
fn 알려진_것이_없으면_없다고_적는다() {
    let mut request = sample_request();
    request.pets.clear();
    request.facts.clear();
    let text = user_prompt(&request);
    assert!(text.matches("(none)").count() >= 2, "{text}");
}

#[test]
fn 지시문은_일곱_종류와_금지_규칙을_적는다() {
    for kind in KINDS {
        assert!(SYSTEM_PROMPT.contains(kind), "{kind}");
    }
    for needle in [
        "health",
        "occupation",
        "Never infer",
        "do_not_remember",
        "supersedes",
        "only",
    ] {
        assert!(SYSTEM_PROMPT.contains(needle), "{needle:?}");
    }
    assert!(!SYSTEM_PROMPT.contains("supersedes_seq"));
}

#[test]
fn 지시문은_번호로_정정하고_이유를_남기고_아이의_아픔은_남긴다() {
    for needle in [
        "if the fact corrects or replaces known facts, list their bracketed numbers",
        "When the user gives a reason for keeping, moving, washing, or not touching something, or for a habit or ritual, keep that reason in the same sentence",
        "Do not extract health or occupation facts about the user or other people",
        "A pet's illness, symptoms, vet visits and recovery are pet facts and are kept",
    ] {
        assert!(SYSTEM_PROMPT.contains(needle), "{needle:?}");
    }
}

#[test]
fn 입력_글의_사실_번호는_1부터_목록_순서다() {
    let text = user_prompt(&sample_request());
    let first = text.find("[1] ").expect("[1]");
    let second = text.find("[2] ").expect("[2]");
    assert!(first < second, "{text}");
    assert!(!text.contains("[3]") && !text.contains("[seq"), "{text}");
}

/// 스키마의 모든 object 는 `additionalProperties: false` 이고 `required` 가 속성 전부다.
fn assert_closed(value: &Value) {
    match value {
        Value::Object(map) => {
            if map.get("type") == Some(&Value::from("object")) {
                assert_eq!(map["additionalProperties"], Value::Bool(false), "{value}");
                let mut properties: Vec<_> = map["properties"]
                    .as_object()
                    .unwrap()
                    .keys()
                    .cloned()
                    .collect();
                let mut required: Vec<_> = map["required"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|key| key.as_str().unwrap().to_owned())
                    .collect();
                properties.sort();
                required.sort();
                assert_eq!(properties, required, "{value}");
            }
            map.values().for_each(assert_closed);
        }
        Value::Array(items) => items.iter().for_each(assert_closed),
        _ => {}
    }
}

#[test]
fn 스키마는_조사의_모양이고_닫혀_있다() {
    let schema: Value = serde_json::from_str(&output_schema(&KINDS)).unwrap();
    assert_closed(&schema);
    assert_eq!(schema["properties"]["do_not_remember"]["type"], "boolean");
    let fact = &schema["properties"]["facts"]["items"];
    let enum_kinds: Vec<_> = fact["properties"]["kind"]["enum"]
        .as_array()
        .unwrap()
        .iter()
        .map(|kind| kind.as_str().unwrap())
        .collect();
    assert_eq!(enum_kinds, KINDS);
    assert_eq!(fact["properties"]["seq"]["type"], "integer");
    assert_eq!(fact["properties"]["text"]["type"], "string");
    assert_eq!(fact["properties"]["supersedes"]["type"], "array");
    assert_eq!(fact["properties"]["supersedes"]["items"]["type"], "integer");
    assert!(fact["properties"].get("supersedes_seq").is_none());
    let text = schema.to_string();
    assert!(!text.contains("health") && !text.contains("job"), "{text}");
}

#[test]
fn 프롬프트_버전() {
    assert_eq!(MEMORY_EXTRACT_PROMPT_VERSION, "0.2.0");
}
