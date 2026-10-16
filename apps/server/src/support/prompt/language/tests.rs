use super::output_language;
use crate::identity::ChatLanguage;

#[test]
fn each_chat_language_names_its_output_language() {
    assert_eq!(output_language(ChatLanguage::Ko), "Korean");
    assert_eq!(output_language(ChatLanguage::En), "English");
}
