// 지식 읽기와 과제별 고르기. 픽스처는 지어낸 조각이다.

use super::{KNOWLEDGE_LIMIT, KnowledgeBase, KnowledgeChunk, candidate_paths};
use crate::support::rules::Task;

fn task(number: u8) -> Task {
    Task::new(number).unwrap()
}

const FIXTURE: &str = r#"{
  "_meta": { "version": "test" },
  "chunks": [
    { "source": "가", "task_id": 1, "tags": ["a"], "content": "하나" },
    { "source": "나", "task_id": 2, "tags": [], "content": "둘" },
    { "source": "다", "task_id": 1, "tags": ["b", 3], "content": "셋" },
    { "source": "라", "task_id": 1, "tags": [], "content": "넷" },
    { "source": "마", "task_id": null, "tags": [], "content": "다섯" },
    { "source": "사", "task_id": 2.0, "tags": [], "content": "일곱" },
    { "source": "바", "task_id": 9, "content": "여섯" },
    { "task_id": 4, "tags": "x" },
    "not an entry"
  ]
}"#;

fn sources(chunks: &[KnowledgeChunk]) -> Vec<&str> {
    chunks.iter().map(|c| c.source.as_str()).collect()
}

#[test]
fn the_limit_is_two_chunks_per_task() {
    assert_eq!(KNOWLEDGE_LIMIT, 2);
}

#[test]
fn retrieve_returns_the_task_chunks_in_file_order_up_to_the_limit() {
    let base = KnowledgeBase::from_json(FIXTURE);
    assert_eq!(
        sources(&base.retrieve(task(1), KNOWLEDGE_LIMIT)),
        ["가", "다"]
    );
    assert_eq!(
        sources(&base.retrieve(task(2), KNOWLEDGE_LIMIT)),
        ["나", "사"],
        "2.0 is an integer task id like TS"
    );
    assert_eq!(sources(&base.retrieve(task(1), 5)), ["가", "다", "라"]);
}

#[test]
fn a_task_without_chunks_falls_back_to_the_whole_pool() {
    let base = KnowledgeBase::from_json(FIXTURE);
    assert_eq!(
        sources(&base.retrieve(task(3), KNOWLEDGE_LIMIT)),
        ["가", "나"]
    );
}

#[test]
fn malformed_fields_are_narrowed_and_non_entries_skipped() {
    let base = KnowledgeBase::from_json(FIXTURE);
    let all = base.retrieve(task(3), 100);
    assert_eq!(all.len(), 8, "the string entry is skipped");
    assert_eq!(all[2].tags, ["b"], "non-string tags are dropped");
    assert_eq!(
        all[7],
        KnowledgeChunk {
            source: String::new(),
            content: String::new(),
            tags: Vec::new(),
        }
    );
    // task_id 4 counts even when the other fields are malformed.
    assert_eq!(base.retrieve(task(4), 2).len(), 1);
    // an out-of-range task_id (9) is not a task, so task 5 falls back to the pool.
    assert_eq!(sources(&base.retrieve(task(5), 1)), ["가"]);
}

#[test]
fn unreadable_text_gives_an_empty_base() {
    for text in [
        "",
        "not json",
        "null",
        "[]",
        r#"{"chunks": 3}"#,
        r#"{"other": []}"#,
    ] {
        let base = KnowledgeBase::from_json(text);
        assert!(base.retrieve(task(1), 2).is_empty(), "{text:?}");
    }
}

#[test]
fn the_working_directory_is_searched_before_the_crate_directory() {
    let paths = candidate_paths();
    assert_eq!(paths.len(), 2);
    assert_eq!(
        paths[0],
        std::path::Path::new("rag-knowledge/grief-knowledge.json")
    );
    assert_eq!(
        paths[1],
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("rag-knowledge/grief-knowledge.json")
    );
}

#[test]
fn the_copied_knowledge_file_loads_with_two_chunks_per_task() {
    let base = KnowledgeBase::load();
    for number in 0..=4 {
        assert_eq!(
            base.retrieve(task(number), KNOWLEDGE_LIMIT).len(),
            2,
            "task {number}"
        );
    }
    assert!(
        base.retrieve(task(1), KNOWLEDGE_LIMIT)[0]
            .source
            .contains("Worden")
    );
}
