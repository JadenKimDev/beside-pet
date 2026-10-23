//! 모델의 답 글을 `ExtractedMemory` 로 읽는다. 답은 스키마로 묶인 JSON object 하나이고, 모양이 다르면 `None`.

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
    let wire: WireExtraction = serde_json::from_str(text.trim()).ok()?;
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
