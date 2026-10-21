//! 판정 질문의 문구와 그 버전. `dev-tools/decision` 평가 하네스의 글(`schema.py` 의 INSTRUCTIONS·CRITERIA,
//! `judges/claude.py` 의 SYSTEM_PROMPT·USER_PROMPT_TEMPLATE·render_prompt)과 같아야 평가 수치를 옮겨 올 수 있다.
//! 위기 턴은 판정하지 않으므로 기준에서 `crisis_fixed` 만 뺐다. 문구를 바꾸면 같은 커밋에서 버전을 올린다(ADR-0022).

use super::JudgeRequest;

/// 판정 프롬프트의 버전(`x.y.z`, ADR-0022). systemone 질문과 글 모델 프롬프트가 함께 쓴다.
pub const JUDGE_PROMPT_VERSION: &str = "0.1.0";

/// Laya 관례: instructions 에서 상태의 키를 백틱으로 가리킨다.
pub(super) const INSTRUCTIONS: &str = "`reply` 는 반려동물을 떠나보낸 보호자에게 동반자가 한 답이고, `user_turns` 는 그 직전 보호자의 말이다. `reply` 의 주된 성격은 무엇인가?";

/// 라벨과 그 설명. 차례가 질문에 그대로 실린다.
pub(super) const CRITERIA: [(&str, &str); 3] = [
    (
        "generic_comfort",
        "보호자가 말한 구체 없이 누구에게나 통하는 일반적인 위로나 안심을 주로 건넴",
    ),
    (
        "specific_reflection",
        "보호자가 말한 구체적인 사실, 이름, 기억, 감정을 되받아 말하는 것이 주됨",
    ),
    ("question", "보호자에게 묻는 것이 답의 주된 부분임"),
];

/// 판정기가 고를 수 있는 라벨(`CRITERIA` 의 차례).
pub const JUDGE_LABELS: [&str; 3] = [CRITERIA[0].0, CRITERIA[1].0, CRITERIA[2].0];

/// 글 모델 판정기의 시스템 프롬프트.
pub(super) const MODEL_SYSTEM_PROMPT: &str = "너는 분류기다. 반려동물을 떠나보낸 보호자와 동반자의 대화에서 동반자의 답(`reply`)이 어떤 성격인지 주어진 옵션 가운데 하나만 고른다. 답에는 옵션의 이름 하나만 쓴다. 설명, 따옴표, 마침표를 붙이지 않는다. 답에 여러 성격이 섞여 있으면 분량이 가장 큰 성격을 고른다. 보호자의 말을 되받는 문장이 하나뿐이고 그 뒤에 질문(괄호의 예시 포함)이 이어지면 question 이다. 되받는 문장이 둘 이상이면 specific_reflection 이다. 보호자가 말한 구체를 받지 않은 위로나 안심이 주면 generic_comfort 다. 첫 인사처럼 받을 말이 없으면 specific_reflection 이 아니다.";

/// 글 모델 판정기의 사용자 글: `render_prompt` 와 같은 채우기 규칙.
pub(super) fn model_prompt(request: &JudgeRequest) -> String {
    let options = CRITERIA
        .iter()
        .map(|(label, text)| format!("- {label}: {text}"))
        .collect::<Vec<_>>()
        .join("\n");
    let turns = if request.user_turns.is_empty() {
        "(없음)".to_owned()
    } else {
        request
            .user_turns
            .iter()
            .map(|turn| format!("- {}", one_line(turn)))
            .collect::<Vec<_>>()
            .join("\n")
    };
    format!(
        "{INSTRUCTIONS}\n\n옵션:\n{options}\n\nuser_turns:\n{turns}\n\nreply:\n{reply}\n\n옵션의 이름 하나만 답하라.",
        reply = request.reply
    )
}

/// 줄바꿈과 겹친 공백을 공백 하나로(파이썬의 `" ".join(text.split())`).
fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
