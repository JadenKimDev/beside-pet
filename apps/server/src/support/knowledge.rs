//! RAG 지식: `rag-knowledge/grief-knowledge.json` 을 읽어 과제별 지식 조각을 고른다(ADR-0014).
//!
//! 파일은 기동 때 한 번 읽어 메모리에 둔다. 읽지 못하면 TS 처럼 경고를 남기고 빈 색인으로 돈다.
//! `serde_json::Value` 는 파일을 읽는 `from_json` 한 곳에서만 쓰고 안으로는 `KnowledgeChunk` 만 넘긴다.

use std::path::{Path, PathBuf};

use serde_json::Value;

use super::rules::Task;

/// 과제 하나에 프롬프트로 보내는 지식 조각의 수(TS 의 `KNOWLEDGE_LIMIT`).
pub const KNOWLEDGE_LIMIT: usize = 2;

const KNOWLEDGE_FILE: &str = "rag-knowledge/grief-knowledge.json";

/// 발화를 받치는 지식 조각 하나.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgeChunk {
    pub source: String,
    pub content: String,
    pub tags: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct IndexedChunk {
    chunk: KnowledgeChunk,
    task: Option<Task>,
}

/// 메모리에 올린 지식 색인. 파일 순서를 지킨다.
#[derive(Debug, Clone, Default)]
pub struct KnowledgeBase {
    chunks: Vec<IndexedChunk>,
}

impl KnowledgeBase {
    /// 작업 디렉터리에서 먼저, 없으면 크레이트 디렉터리에서 지식 파일을 찾아 읽는다.
    pub fn load() -> KnowledgeBase {
        let Some(path) = candidate_paths().into_iter().find(|p| p.is_file()) else {
            tracing::warn!(
                file = KNOWLEDGE_FILE,
                "knowledge file not found; operating with an empty index"
            );
            return KnowledgeBase::default();
        };
        match std::fs::read_to_string(&path) {
            Ok(text) => KnowledgeBase::from_json(&text),
            Err(error) => {
                tracing::warn!(file = %path.display(), kind = %error.kind(), "knowledge file could not be read; operating with an empty index");
                KnowledgeBase::default()
            }
        }
    }

    /// 파일 내용을 읽는 경계. 모양이 틀린 칸은 TS 처럼 빈 값으로 좁히고, 객체가 아닌 항목은 버린다.
    pub fn from_json(text: &str) -> KnowledgeBase {
        let Ok(parsed) = serde_json::from_str::<Value>(text) else {
            tracing::warn!("knowledge file is not valid JSON; operating with an empty index");
            return KnowledgeBase::default();
        };
        let entries = parsed.get("chunks").and_then(Value::as_array);
        let chunks = entries
            .into_iter()
            .flatten()
            .filter(|entry| entry.is_object())
            .map(|entry| IndexedChunk {
                chunk: KnowledgeChunk {
                    source: text_field(entry, "source"),
                    content: text_field(entry, "content"),
                    tags: entry
                        .get("tags")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .filter_map(Value::as_str)
                        .map(str::to_owned)
                        .collect(),
                },
                task: entry.get("task_id").and_then(task_of),
            })
            .collect();
        KnowledgeBase { chunks }
    }

    /// 그 과제의 조각을 파일 순서대로 `limit` 개까지. 그 과제의 조각이 없으면 전체에서 고른다.
    pub fn retrieve(&self, task: Task, limit: usize) -> Vec<KnowledgeChunk> {
        let matched: Vec<&IndexedChunk> = self
            .chunks
            .iter()
            .filter(|c| c.task == Some(task))
            .collect();
        let pool = if matched.is_empty() {
            self.chunks.iter().collect()
        } else {
            matched
        };
        pool.into_iter()
            .take(limit)
            .map(|c| c.chunk.clone())
            .collect()
    }
}

fn text_field(entry: &Value, key: &str) -> String {
    entry
        .get(key)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned()
}

/// TS 의 `isTaskId`: 0..=5 의 정수(`2.0` 도 정수다).
fn task_of(value: &Value) -> Option<Task> {
    let number = value.as_f64()?;
    if number.fract() != 0.0 || !(0.0..=5.0).contains(&number) {
        return None;
    }
    Task::new(number as u8)
}

/// 찾는 순서: 작업 디렉터리, 크레이트 디렉터리(`shared/config.rs` 가 env 파일을 찾는 순서와 같다).
fn candidate_paths() -> Vec<PathBuf> {
    vec![
        PathBuf::from(KNOWLEDGE_FILE),
        Path::new(env!("CARGO_MANIFEST_DIR")).join(KNOWLEDGE_FILE),
    ]
}

#[cfg(test)]
mod tests;
