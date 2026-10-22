//! 기억 추출의 지시문, 입력 글, 답의 스키마와 그 버전. 문구를 바꾸면 같은 커밋에서 버전을 올린다(ADR-0022).

use super::MemoryExtractRequest;

/// 기억 추출 프롬프트의 버전(`x.y.z`, ADR-0022).
pub const MEMORY_EXTRACT_PROMPT_VERSION: &str = "0.1.0";

/// 시스템 지시문. 영어다(사실의 글은 세션 언어로 쓰게 한다).
/// 스키마로 답을 묶지 못하는 공급자도 있으므로 JSON 모양을 지시문에도 적는다.
pub(super) const SYSTEM_PROMPT: &str = r#"You keep a short list of durable facts that a person who lost (or is losing) a pet has shared with an emotional support companion, so the companion can remember them in later sessions.
You get the KNOWN PETS, the KNOWN FACTS (each with the seq of the user message it came from), and ONE NEW USER MESSAGE with its seq. Extract only the durable facts the user states in that new message.

Output only one JSON object, with no prose and no code fences:
{"facts":[{"kind":"<kind>","pet_name":"<name>" or null,"text":"<one sentence>","seq":<integer>,"supersedes_seq":<integer> or null}],"do_not_remember":<true|false>}

Rules:
- kind is one of: pet (an animal: its name, species, looks, habits, or that another pet exists), person (people in the user's life and how they relate to the pet or the loss), object (belongings and keepsakes), place (places tied to the pet), date (dates or times the user stated), ritual (things the user does to remember the pet), preference (what the pet or the user liked or disliked).
- Do not extract health or occupation facts about the user or any other person: no illness, medication, diagnosis, mental state, job, or workplace.
- Only what the user stated in the new message. Feelings of the moment are not durable facts. Do not repeat known facts that did not change.
- Never infer dates, ages, durations, or other numbers that are not written in the message. Copy numbers as written and do not turn relative times into dates.
- text is one short sentence in the session language, close to the user's words, about one fact.
- seq is the seq of the new message.
- pet_name is the name of the pet the fact is about, as written in the known pets or the message; null if the fact is not about a particular pet.
- supersedes_seq: if the fact corrects or replaces a known fact, the seq of that known fact; otherwise null.
- If the user asks not to remember, record, or bring up something (for example "don't remember this" or "forget what I just said"), set do_not_remember to true and output no facts.
- If nothing durable was said, output {"facts":[],"do_not_remember":false}."#;

/// 사용자 글: 언어, 아이들, 알려진 사실(seq 와 함께), 이번 발화.
pub(super) fn user_prompt(request: &MemoryExtractRequest) -> String {
    let pets = lines(
        request
            .pets
            .iter()
            .map(|pet| format!("- {} ({})", pet.name, pet.status)),
    );
    let facts = lines(request.facts.iter().map(|fact| {
        let pet = fact
            .pet_name
            .as_deref()
            .map(|name| format!(" ({name})"))
            .unwrap_or_default();
        format!("- [seq {}] {}{pet}: {}", fact.seq, fact.kind, fact.text)
    }));
    format!(
        "Session language: {language}\n\nKNOWN PETS:\n{pets}\n\nKNOWN FACTS:\n{facts}\n\nNEW USER MESSAGE (seq {seq}):\n{utterance}",
        language = request.language,
        seq = request.seq,
        utterance = request.utterance,
    )
}

/// 줄들을 잇는다. 없으면 `(none)`.
fn lines(items: impl Iterator<Item = String>) -> String {
    let joined = items.collect::<Vec<_>>().join("\n");
    if joined.is_empty() {
        "(none)".to_owned()
    } else {
        joined
    }
}

/// 답의 JSON 스키마(조사 4.2절). 모든 object 에 `additionalProperties: false`, `required` 는 전부.
/// 속성 이름에 민감한 낱말을 넣지 않는다(스키마는 공급자 쪽에 캐시된다).
pub(super) fn output_schema(kinds: &[&'static str]) -> String {
    let kinds = serde_json::to_string(kinds).unwrap_or_else(|_| "[]".to_owned());
    format!(
        concat!(
            r#"{{"type":"object","properties":{{"#,
            r#""facts":{{"type":"array","items":{{"type":"object","properties":{{"#,
            r#""kind":{{"type":"string","enum":{kinds}}},"#,
            r#""pet_name":{{"anyOf":[{{"type":"string"}},{{"type":"null"}}]}},"#,
            r#""text":{{"type":"string"}},"#,
            r#""seq":{{"type":"integer"}},"#,
            r#""supersedes_seq":{{"anyOf":[{{"type":"integer"}},{{"type":"null"}}]}}"#,
            r#"}},"required":["kind","pet_name","text","seq","supersedes_seq"],"additionalProperties":false}}}},"#,
            r#""do_not_remember":{{"type":"boolean"}}"#,
            r#"}},"required":["facts","do_not_remember"],"additionalProperties":false}}"#,
        ),
        kinds = kinds
    )
}
