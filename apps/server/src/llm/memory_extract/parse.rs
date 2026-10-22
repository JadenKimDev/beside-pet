//! 모델의 답 글을 `ExtractedMemory` 로 읽는다. 코드 펜스와 앞뒤 군말을 벗기고, 모양이 다르면 `None`.

use serde::Deserialize;

use super::{ExtractedMemory, MemoryFact};

#[derive(Deserialize)]
struct WireExtraction {
    facts: Vec<WireFact>,
    do_not_remember: bool,
}

#[derive(Deserialize)]
struct WireFact {
    kind: String,
    pet_name: Option<String>,
    text: String,
    seq: i32,
    supersedes: Vec<i32>,
}

/// 답 글에서 JSON object 하나를 읽는다.
pub(super) fn parse_extraction(text: &str) -> Option<ExtractedMemory> {
    let wire: WireExtraction = serde_json::from_str(strip_fences(text)).ok()?;
    Some(ExtractedMemory {
        facts: wire
            .facts
            .into_iter()
            .map(|fact| MemoryFact {
                kind: fact.kind,
                pet_name: fact.pet_name,
                text: fact.text,
                seq: fact.seq,
                supersedes: fact.supersedes,
            })
            .collect(),
        do_not_remember: wire.do_not_remember,
    })
}

/// 코드 펜스(```json … ```)와 object 밖의 글을 벗긴다: 첫 `{` 부터 마지막 `}` 까지. 없으면 다듬은 글 그대로.
pub(super) fn strip_fences(text: &str) -> &str {
    let trimmed = text.trim();
    match (trimmed.find('{'), trimmed.rfind('}')) {
        (Some(start), Some(end)) if start < end => &trimmed[start..=end],
        _ => trimmed,
    }
}
