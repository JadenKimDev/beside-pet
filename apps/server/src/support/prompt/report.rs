//! 마음 리포트의 모델 입력과 출력의 약속(`@@marker`): 프롬프트와 파서를 한 곳에 둬 둘이 어긋나지 않게 한다.
//!
//! 문구와 파서의 동작은 TS 의 `report.prompt.ts` 그대로이고, emotions 첫 줄의 감정 낱말만 더했다(#15, ADR-0018). 구조(도달한 과제, 진행률, 위기)는 규칙이 정해 넘긴다.

use std::sync::OnceLock;

use regex::Regex;

use super::language::output_language;
use super::transcript::speaker_lines;
use crate::support::ReportSectionKey;
use crate::support::rules::{GriefProfile, Task};
use crate::support::session::Message;

/// 이 프롬프트의 버전(`x.y.z`). 문구를 바꾸는 커밋이 같은 커밋에서 올린다: major 는 실측 기준선을 새로 잡는 변경,
/// minor 는 같은 기준선에서 비교할 수 있는 문구 변경, patch 는 오탈자와 다듬기.
pub const PROMPT_VERSION: &str = "0.1.0";

/// 리포트 한 번을 쓰는 데 필요한 것. 펫 이름과 언어는 프로필에서 구한다.
#[derive(Debug, Clone, Copy)]
pub struct ReportContext<'a> {
    pub profile: &'a GriefProfile,
    pub reached_task: Task,
    /// 위기 지원 수준에 닿았는가(부드러운 연락처 안내를 더한다).
    pub crisis: bool,
    pub history: &'a [Message],
}

/// 모델이 쓴 네 구역의 본문. 빠진 구역은 빈 글이다.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ReportBodies {
    pub journey: String,
    pub emotions: String,
    pub keepsake: String,
    pub encouragement: String,
    /// emotions 구역 첫 줄의 감정 낱말(최대 4개). 낱말 줄이 없던 옛 출력은 비어 있다.
    pub emotion_tags: Vec<String>,
}

impl ReportBodies {
    pub fn get(&self, key: ReportSectionKey) -> &str {
        match key {
            ReportSectionKey::Journey => &self.journey,
            ReportSectionKey::Emotions => &self.emotions,
            ReportSectionKey::Keepsake => &self.keepsake,
            ReportSectionKey::Encouragement => &self.encouragement,
        }
    }

    fn slot(&mut self, key: ReportSectionKey) -> &mut String {
        match key {
            ReportSectionKey::Journey => &mut self.journey,
            ReportSectionKey::Emotions => &mut self.emotions,
            ReportSectionKey::Keepsake => &mut self.keepsake,
            ReportSectionKey::Encouragement => &mut self.encouragement,
        }
    }
}

const MARKERS: [(ReportSectionKey, &str); 4] = [
    (ReportSectionKey::Journey, "@@journey"),
    (ReportSectionKey::Emotions, "@@emotions"),
    (ReportSectionKey::Keepsake, "@@keepsake"),
    (ReportSectionKey::Encouragement, "@@encouragement"),
];

pub fn report_system_prompt(context: &ReportContext<'_>) -> String {
    let pet_name = context.profile.display_pet_name();
    let language = output_language(context.profile.language());
    let crisis_note = if context.crisis {
        " If their pain feels heavy, gently add that professional support lines (e.g., 109 in Korea, 988 in the US) are always there to lean on."
    } else {
        ""
    };
    [
        "You are a warm companion who just walked through a pet-loss grief conversation with the user. You now hand them a \"mind report\" that looks back on the conversation.".to_owned(),
        format!(
            "The pet's name is \"{pet_name}\". Write ONLY in {language}, in a soft and heartfelt tone."
        ),
        "Do not use medical language such as treatment, diagnosis, or prescription. Use only the language of emotional support and companionship.".to_owned(),
        "Write each of the four sections below in 2-3 sentences. Each section MUST start with its marker:".to_owned(),
        "@@journey — Warmly acknowledge the steps of grief walked today as an achievement.".to_owned(),
        format!(
            "@@emotions — On the first line right after the marker, write only 2-4 words naming the feelings that surfaced in the conversation, in {language}, separated by commas, with nothing else on that line. Then, from the next line, acknowledge those feelings and reassure them that these are natural feelings born of love."
        ),
        format!("@@keepsake — Pick one memory of {pet_name} from what the user actually shared, and reflect it back as something to hold on to."),
        format!("@@encouragement — Close by honoring today and offering one line that helps them be gentle with themselves.{crisis_note}"),
        "Apart from that one line of feeling words, output only the markers (@@journey etc.) and their bodies — no other headers, lists, or quotation marks.".to_owned(),
    ]
    .join("\n")
}

pub fn report_user_prompt(context: &ReportContext<'_>) -> String {
    let profile = context.profile;
    let together = profile
        .together_range
        .map_or("unknown", |range| range.as_str());
    let loss_or_situation = profile
        .loss_type
        .map(|loss| loss.as_str())
        .or_else(|| profile.situation.map(|situation| situation.as_str()))
        .unwrap_or("unknown");
    let percent = (context.reached_task.progress() * 100.0).round();
    [
        "[Facts]".to_owned(),
        format!("- Pet: {}", profile.display_pet_name()),
        format!("- Time together: {together}"),
        format!("- Type of loss/situation: {loss_or_situation}"),
        format!(
            "- Stage reached: {}/5 (progress {percent}%)",
            context.reached_task.number()
        ),
        String::new(),
        "[Transcript]".to_owned(),
        speaker_lines(context.history),
    ]
    .join("\n")
}

/// 마커로 가른 모델 출력을 구역 본문으로 나눈다. 구역마다 처음 나온 마커부터 다음 마커(어느 구역이든)나 끝까지가
/// 본문이고, 앞뒤 공백을 걷는다. 순서가 뒤바뀌어도 제 구역에 들어가고, 빠지거나 빈 구역은 빈 글이다.
pub fn parse_report_bodies(raw: &str) -> ReportBodies {
    let mut bodies = ReportBodies::default();
    for (key, marker) in MARKERS {
        let Some(found) = raw.find(marker) else {
            continue;
        };
        let rest = raw[found + marker.len()..].trim_start();
        let end = next_marker().find(rest).map_or(rest.len(), |m| m.start());
        *bodies.slot(key) = rest[..end].trim().to_owned();
    }
    if let Some((tags, body)) = split_emotion_tags(&bodies.emotions) {
        bodies.emotion_tags = tags;
        bodies.emotions = body;
    }
    bodies
}

/// 프롬프트가 emotions 구역 첫 줄에 쓰라고 한 감정 낱말의 최대 개수.
const MAX_EMOTION_TAGS: usize = 4;
/// 낱말 하나의 길이 상한(글자). 넘으면 낱말 줄이 아니라 문장으로 본다.
const MAX_TAG_CHARS: usize = 20;

/// emotions 본문의 첫 줄이 쉼표로 가른 감정 낱말이면 (낱말, 나머지 본문)을 돌려준다. 낱말 줄의 모양이 아니면
/// (쉼표가 없다, 문장 부호로 끝나는 항목, 긴 항목, 낱말이 둘 미만) `None` 이고 본문은 그대로 남는다.
fn split_emotion_tags(emotions: &str) -> Option<(Vec<String>, String)> {
    let (first, rest) = emotions.split_once('\n').unwrap_or((emotions, ""));
    if !first.contains(TAG_SEPARATORS) {
        return None;
    }
    let tags: Vec<String> = first
        .split(TAG_SEPARATORS)
        .map(str::trim)
        .filter(|tag| !tag.is_empty())
        .map(str::to_owned)
        .collect();
    let looks_like_words = tags.len() >= 2
        && tags
            .iter()
            .all(|tag| tag.chars().count() <= MAX_TAG_CHARS && !tag.contains(SENTENCE_ENDS));
    if !looks_like_words {
        return None;
    }
    let tags = tags.into_iter().take(MAX_EMOTION_TAGS).collect();
    Some((tags, rest.trim().to_owned()))
}

/// 낱말 사이의 쉼표. 모델이 전각 쉼표나 모점을 쓸 때도 가른다.
const TAG_SEPARATORS: [char; 3] = [',', '，', '、'];
/// 낱말 줄에는 오지 않는 문장 끝 부호.
const SENTENCE_ENDS: [char; 6] = ['.', '!', '?', '。', '！', '？'];

/// 다음 구역의 시작. TS 의 `\b` 처럼 ASCII 낱말 경계다(`@@emotionsX` 는 시작이 아니다).
fn next_marker() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| {
        Regex::new(r"@@(?:journey|emotions|keepsake|encouragement)(?-u:\b)")
            .expect("marker pattern is valid")
    })
}

#[cfg(test)]
mod tests;
