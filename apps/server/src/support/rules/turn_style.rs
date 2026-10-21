//! 이번 턴의 화법: 최근 대화에서 질문 여부, 정상화 위로 쉬기, 어미 반복, 이미 쓴 상투구를 정해 발화 지시 한 줄로 만든다.
//!
//! 저장하지 않는다. 매 턴 세션 기록에서 다시 구한다. 패턴은 이 모듈 한 곳에만 두고,
//! 영어 패턴은 소문자로 바꾼 본문에 맞춘다. 한국어 패턴은 영어 대화에 맞지 않을 뿐 규칙은 같다.

use crate::support::ReplyPhase;

/// 사용자가 질문을 그만 받고 싶다는 표현.
const REFUSAL: &[&str] = &[
    "그만 물",
    "질문 그만",
    "질문 좀 그만",
    "그만해",
    "묻지 마",
    "포장하지",
    "몰라",
    "모르겠",
    "싫어",
    "됐어",
    "stop asking",
];

/// "그렇게 느끼는 게 자연스럽다"류의 정상화 위로.
const REASSURE: &[&str] = &[
    "그만큼",
    "자연스러",
    "당연",
    "이상한 게 아니",
    "이상하지 않",
    "natural",
    "normal",
];

/// 한 번 쓰면 같은 세션에서 다시 쓰지 않게 넘기는 상투구.
const STOCK: &[&str] = &[
    "천천히",
    "여기 있을게",
    "함께 있을게",
    "곁에 있을게",
    "여기 있어요",
    "함께 있어요",
    "코끝",
    "살랑",
    "꼬리",
    "(예:",
    "(예를",
    "마음이 느껴",
    "충분히 그럴",
    "자연스러운 마음",
    "자연스러운 일",
];

const REFUSAL_WINDOW: usize = 3;
const SHORT_WINDOW: usize = 2;
const SHORT_CHARS: usize = 15;
const REASSURE_WINDOW: usize = 4;
const ENDING_CHARS: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QuestionPolicy {
    Forbid,
    Allow,
    Invite,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnStyle {
    pub phase: ReplyPhase,
    pub question: QuestionPolicy,
    pub avoid_reassure: bool,
    pub repeated_ending: Option<String>,
    pub used_stock: Vec<&'static str>,
}

impl TurnStyle {
    /// `companion` 과 `user` 는 이 세션의 지난 동반자 답과 사용자 말이고, 오래된 것부터 최근 순이다.
    pub fn from_history(phase: ReplyPhase, companion: &[&str], user: &[&str]) -> TurnStyle {
        TurnStyle {
            phase,
            question: question_policy(phase, companion, user),
            avoid_reassure: last(companion, REASSURE_WINDOW)
                .iter()
                .any(|reply| matches_any(reply, REASSURE)),
            repeated_ending: repeated_ending(companion),
            used_stock: STOCK
                .iter()
                .copied()
                .filter(|stock| companion.iter().any(|reply| reply.contains(stock)))
                .filter(|stock| !user.iter().any(|said| said.contains(stock)))
                .collect(),
        }
    }

    /// 발화 지시문 끝에 붙일 영어 한 줄. 넘기는 어미와 상투구만 원문이다.
    pub fn instruction(&self) -> String {
        let mut hints: Vec<String> = Vec::new();
        match (self.question, self.phase) {
            (QuestionPolicy::Forbid, _) => {
                hints.push("Do not ask any question in this reply.".into())
            }
            (QuestionPolicy::Invite, ReplyPhase::Intro) => {
                hints.push("Open the story of the pet with one gentle question.".into())
            }
            (QuestionPolicy::Invite, _) => hints
                .push("If it feels natural, open the next topic with one gentle question.".into()),
            (QuestionPolicy::Allow, _) => {}
        }
        if self.avoid_reassure {
            hints.push(
                "Do not say their feelings are natural, understandable, or proof of how much they loved the pet; you said that recently."
                    .into(),
            );
        }
        if let Some(ending) = &self.repeated_ending {
            hints.push(format!(
                "Your last two replies ended the same way (\"…{ending}\"); end this one differently."
            ));
        }
        if !self.used_stock.is_empty() {
            let quoted: Vec<String> = self.used_stock.iter().map(|s| format!("\"{s}\"")).collect();
            hints.push(format!(
                "Already said earlier in this chat, so say something else instead: {}.",
                quoted.join(", ")
            ));
        }
        hints.push(
            "Refer to what they said in your own words; do not open by repeating their sentence."
                .into(),
        );
        format!("For this reply: {}", hints.join(" "))
    }
}

fn question_policy(phase: ReplyPhase, companion: &[&str], user: &[&str]) -> QuestionPolicy {
    if phase == ReplyPhase::Intro {
        return QuestionPolicy::Invite;
    }
    let refused = last(user, REFUSAL_WINDOW)
        .iter()
        .any(|said| matches_any(said, REFUSAL));
    let recent = last(user, SHORT_WINDOW);
    let short = recent.len() == SHORT_WINDOW
        && recent.iter().all(|said| said.chars().count() < SHORT_CHARS);
    let asked_last = companion
        .last()
        .is_some_and(|reply| ends_with_question(reply));
    if refused || short || asked_last {
        QuestionPolicy::Forbid
    } else if phase == ReplyPhase::Task {
        QuestionPolicy::Invite
    } else {
        QuestionPolicy::Allow
    }
}

fn last<'a, 'b>(items: &'b [&'a str], n: usize) -> &'b [&'a str] {
    &items[items.len().saturating_sub(n)..]
}

fn matches_any(text: &str, patterns: &[&str]) -> bool {
    let lower = text.to_lowercase();
    patterns.iter().any(|pattern| lower.contains(pattern))
}

/// 끝의 괄호 꼬리 "(예: …)" 를 떼고 물음표로 끝나는지 본다.
fn ends_with_question(reply: &str) -> bool {
    let mut text = reply.trim_end();
    text = text.strip_suffix('.').unwrap_or(text).trim_end();
    if let Some(body) = text.strip_suffix(')')
        && let Some(open) = body.rfind('(')
        && !body[open + 1..].contains(['(', ')'])
    {
        text = body[..open].trim_end();
    }
    text.ends_with('?') || text.ends_with('？')
}

/// 직전 두 답의 끝 네 글자(공백과 끝 문장부호를 뗀 것)가 같으면 그 네 글자.
fn repeated_ending(companion: &[&str]) -> Option<String> {
    let [before, latest] = last(companion, 2) else {
        return None;
    };
    let a = ending(before);
    let b = ending(latest);
    (!a.is_empty() && a == b).then_some(a)
}

fn ending(reply: &str) -> String {
    let body = reply
        .trim_end()
        .trim_end_matches(['?', '？', '.', '!', '~', '…', ' ']);
    let chars: Vec<char> = body.chars().filter(|c| !c.is_whitespace()).collect();
    chars[chars.len().saturating_sub(ENDING_CHARS)..]
        .iter()
        .collect()
}

#[cfg(test)]
mod tests;
