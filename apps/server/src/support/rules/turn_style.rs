//! 이번 턴의 화법: 최근 대화와 직전 답의 판정에서 질문 여부, 정상화 위로 쉬기, 어미 반복, 이미 쓴 상투구, 구체 하나 받기,
//! 짧은 말 뒤의 짧은 답, 직전 답의 동작 넘기기를 정해 발화 지시 한 줄로 만든다.
//!
//! 저장하지 않는다(ADR-0027). 매 턴 세션 기록에서 다시 구한다. `decisions()` 는 sandbox 의 턴 추적에 남기는 관찰 기록용이다. 패턴은 이 모듈 한 곳에만 두고,
//! 영어 패턴은 소문자로 바꾼 본문에 맞춘다. 한국어 패턴은 영어 대화에 맞지 않을 뿐 규칙은 같다.

use serde::Serialize;

use super::ReplyJudgement;
use crate::support::{ReplyLabel, ReplyPhase};

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

/// 감정 추정: 사용자가 말하지 않은 감정을 짐작해 돌려준다(조사 2.1 의 T1).
const FEELING_GUESS: &[&str] = &[
    "것 같아요",
    "것 같네요",
    "셨겠",
    "겠어요",
    "겠네요",
    "겠죠",
    "나 봐요",
    "짐작",
    "느껴져요",
    "느껴지시",
    "느껴지네",
    "실 거예요",
    "실 것 같",
    "하시겠",
    "힘드시",
    "무거우시",
    "아프시",
    "지치실",
    "must have felt",
    "must have been",
    "you must feel",
    "you must be",
    "i imagine you",
    "i can imagine",
    "can only imagine",
    "you probably felt",
];

/// 뜻 부여: 사용자의 상태를 "그것은 ~라는 뜻"으로 해석해 준다(T2). "그만큼" 은 `REASSURE` 에도 있다.
const MEANING_GIVEN: &[&str] = &[
    "뜻이",
    "뜻일",
    "때문일 거",
    "보여 주",
    "보여주",
    "증거",
    "그만큼",
    "기억하는 방식",
    "받아들이는 중",
    "붙잡고 계신",
    "shows how much",
    "a sign of",
    "proof of",
    "is how love",
    "reflects how much",
    "means you loved",
];

/// 허락: "~해도 괜찮아요", "~셔도 돼요", "~않아도 돼요"(T3). "당연", "자연스러" 같은 정상화는 `REASSURE` 가 맡는다.
const PERMISSION: &[&str] = &[
    "도 괜찮",
    "도 돼",
    "않아도 되",
    "않으셔도",
    "그럴 수밖에",
    "it's okay to",
    "it’s okay to",
    "it is okay to",
    "it's ok to",
    "you don't have to",
    "you don’t have to",
    "you do not have to",
    "it's alright to",
    "give yourself permission",
];

const REFUSAL_WINDOW: usize = 3;
const SHORT_WINDOW: usize = 2;
const SHORT_CHARS: usize = 15;
const REASSURE_WINDOW: usize = 4;
const ENDING_CHARS: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum QuestionPolicy {
    Forbid,
    Allow,
    Invite,
}

/// 직전 답이 한 동작. 순서는 감지와 기록의 순서다.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActionKind {
    FeelingGuess,
    MeaningGiven,
    Permission,
}

impl ActionKind {
    const ALL: [ActionKind; 3] = [
        ActionKind::FeelingGuess,
        ActionKind::MeaningGiven,
        ActionKind::Permission,
    ];

    fn patterns(self) -> &'static [&'static str] {
        match self {
            ActionKind::FeelingGuess => FEELING_GUESS,
            ActionKind::MeaningGiven => MEANING_GIVEN,
            ActionKind::Permission => PERMISSION,
        }
    }
}

/// 이번 턴의 화법 결정. sandbox 의 턴 추적(`trace.turnStyle`)에 그대로 남는다.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnStyleDecisions {
    pub question_policy: QuestionPolicy,
    pub reassure_cooldown: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ending_avoid: Option<String>,
    pub stock_passed: Vec<&'static str>,
    pub judge_line: bool,
    pub short_rule: bool,
    pub action_rule: Vec<ActionKind>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TurnStyle {
    pub phase: ReplyPhase,
    pub question: QuestionPolicy,
    pub avoid_reassure: bool,
    pub repeated_ending: Option<String>,
    pub used_stock: Vec<&'static str>,
    /// 직전 답이 일반 위로로 판정됐다(ADR-0031). 이번엔 사용자가 말한 구체 하나를 받는다.
    pub after_generic: bool,
    /// 직전 사용자 말이 `SHORT_CHARS` 이하다. 이번엔 한두 문장, 질문 없이, 그 말 하나에 머문다.
    pub short_reply: bool,
    /// 직전 답이 한 동작(사용자가 직전에 쓴 낱말은 빼고). 이번엔 같은 동작을 넘긴다.
    pub after_action: Vec<ActionKind>,
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
            after_generic: false,
            short_reply: phase != ReplyPhase::Intro
                && user
                    .last()
                    .is_some_and(|said| said.trim().chars().count() <= SHORT_CHARS),
            after_action: companion
                .last()
                .map(|reply| actions(reply, user.last().copied().unwrap_or("")))
                .unwrap_or_default(),
        }
    }

    /// 턴 추적에 남길 결정. 지시 줄과 같은 칸에서 구한다.
    pub fn decisions(&self) -> TurnStyleDecisions {
        TurnStyleDecisions {
            question_policy: self.question,
            reassure_cooldown: self.avoid_reassure,
            ending_avoid: self.repeated_ending.clone(),
            stock_passed: self.used_stock.clone(),
            judge_line: self.after_generic,
            short_rule: self.short_reply,
            action_rule: self.after_action.clone(),
        }
    }

    /// 직전 답의 판정을 더한다. 라벨이 `generic_comfort` 이고 확률이 `threshold` 이상이면(확률이 없는 판정기는 라벨만으로)
    /// 이번 턴에 구체 하나를 받게 한다. 판정이 없으면 그대로다.
    pub fn after_judgement(self, previous: Option<&ReplyJudgement>, threshold: f32) -> TurnStyle {
        let after_generic = previous.is_some_and(|reply| {
            reply.label == ReplyLabel::GenericComfort
                && reply
                    .label_probability
                    .is_none_or(|probability| probability >= threshold)
        });
        TurnStyle {
            after_generic,
            ..self
        }
    }

    /// 발화 지시문 끝에 붙일 영어 한 줄. 넘기는 어미와 상투구만 원문이다.
    pub fn instruction(&self) -> String {
        let mut hints: Vec<String> = Vec::new();
        match (self.question, self.phase) {
            _ if self.short_reply => hints.push(
                "Keep this reply to one or two sentences, ask no question, and stay with the one thing they said."
                    .into(),
            ),
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
        match (self.after_action.is_empty(), self.avoid_reassure) {
            (false, true) => hints.push(
                "Your last reply explained their feelings; this time say only what you notice, or answer what they asked, and do not call their feelings natural or proof of love."
                    .into(),
            ),
            (false, false) => hints.push(
                "Your last reply explained their feelings; this time say only what you notice, or answer what they asked."
                    .into(),
            ),
            (true, _) => {}
        }
        if self.avoid_reassure && self.after_action.is_empty() {
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
        if self.after_generic {
            hints.push(
                "Your last reply was general comfort; this time pick up one concrete thing they said."
                    .into(),
            );
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

/// `reply` 가 한 동작. `said`(직전 사용자 말)에 있는 패턴은 사용자의 낱말이라 세지 않는다.
fn actions(reply: &str, said: &str) -> Vec<ActionKind> {
    let reply = reply.to_lowercase();
    let said = said.to_lowercase();
    ActionKind::ALL
        .into_iter()
        .filter(|kind| {
            kind.patterns()
                .iter()
                .any(|pattern| reply.contains(pattern) && !said.contains(pattern))
        })
        .collect()
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
