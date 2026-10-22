//! 모델 추출의 결과 모양(조사 4.2절 스키마). 아직 걸러지지 않은 값이라 `kind` 는 문자열 그대로 받는다.

/// 발화 하나에서 모델이 뽑은 것. `do_not_remember` 는 사용자가 "기억하지 마"라고 했다는 뜻이다.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Extraction {
    pub facts: Vec<ExtractedFact>,
    pub do_not_remember: bool,
}

/// 모델이 뽑은 사실 하나. `seq` 는 출처 사용자 메시지, `supersedes_seq` 는 이 사실이 정정하는 옛 사실의 메시지다.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExtractedFact {
    pub kind: String,
    pub pet_name: Option<String>,
    pub text: String,
    pub seq: i32,
    pub supersedes_seq: Option<i32>,
}
