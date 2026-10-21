//! 판정기 테스트. systemone 은 테스트 안에서 띄운 가짜 서버(axum, 127.0.0.1 임의 포트)에, 글 모델은 정해 둔 글을
//! 돌려주는 더블에 붙인다. 실제 네트워크와 모델에는 나가지 않고 본문은 지어냈다.

mod fake_systemone;
mod haiku;
mod systemone;

use super::JudgeRequest;

/// 지어낸 판정 입력.
fn sample_request() -> JudgeRequest {
    JudgeRequest {
        user_turns: vec![
            "지어낸 첫 말".to_owned(),
            "지어낸 둘째 말\n두 줄로".to_owned(),
        ],
        reply: "지어낸 답 하나".to_owned(),
    }
}

/// 평가 하네스(`schema.py`)의 INSTRUCTIONS 원문. 서버 쪽 글이 이것과 달라지면 평가 수치를 옮겨 올 수 없다.
const HARNESS_INSTRUCTIONS: &str = "`reply` 는 반려동물을 떠나보낸 보호자에게 동반자가 한 답이고, `user_turns` 는 그 직전 보호자의 말이다. `reply` 의 주된 성격은 무엇인가?";

/// 평가 하네스의 CRITERIA 원문에서 `crisis_fixed` 를 뺀 것(차례 그대로).
const HARNESS_CRITERIA: [(&str, &str); 3] = [
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
