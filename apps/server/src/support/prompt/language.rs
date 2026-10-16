//! 출력 언어: 대화 언어(`ChatLanguage`)를 "Respond ONLY in {언어}" 지시문에 넣을 언어 이름으로 바꾼다.
//!
//! 프롬프트는 영어로 쓰고, 답하는 언어는 이 이름으로 정한다(TS 의 `OUTPUT_LANGUAGE`).

use crate::identity::ChatLanguage;

pub fn output_language(language: ChatLanguage) -> &'static str {
    match language {
        ChatLanguage::Ko => "Korean",
        ChatLanguage::En => "English",
    }
}

#[cfg(test)]
mod tests;
