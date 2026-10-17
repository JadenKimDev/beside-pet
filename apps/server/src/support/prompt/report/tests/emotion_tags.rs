// emotions 구역 첫 줄의 감정 낱말: 낱말 줄이면 떼어 `emotion_tags` 로, 아니면 본문을 그대로 둔다.

use super::super::parse_report_bodies;

fn tags(list: &[&str]) -> Vec<String> {
    list.iter().map(|tag| (*tag).to_owned()).collect()
}

#[test]
fn the_first_line_of_words_becomes_tags_and_leaves_the_body() {
    let raw = "@@journey 길.\n@@emotions\n그리움, 미안함, 고마움\n그 마음들은 모두 사랑에서 나왔어요.\n@@keepsake 기억.";
    let parsed = parse_report_bodies(raw);
    assert_eq!(parsed.emotion_tags, tags(&["그리움", "미안함", "고마움"]));
    assert_eq!(parsed.emotions, "그 마음들은 모두 사랑에서 나왔어요.");
    assert_eq!(parsed.journey, "길.");
    assert_eq!(parsed.keepsake, "기억.");
}

#[test]
fn the_word_line_may_sit_on_the_marker_line() {
    let raw = "@@emotions longing, guilt\nThose feelings come from love.";
    let parsed = parse_report_bodies(raw);
    assert_eq!(parsed.emotion_tags, tags(&["longing", "guilt"]));
    assert_eq!(parsed.emotions, "Those feelings come from love.");
}

#[test]
fn words_are_trimmed_empty_items_dropped_and_capped_at_four() {
    let raw = "@@emotions\n  그리움 ,, 미안함,  고마움 , 슬픔, 안도, \n본문.";
    let parsed = parse_report_bodies(raw);
    assert_eq!(
        parsed.emotion_tags,
        tags(&["그리움", "미안함", "고마움", "슬픔"])
    );
    assert_eq!(parsed.emotions, "본문.");
}

#[test]
fn full_width_and_ideographic_commas_also_separate_words() {
    let raw = "@@emotions\n그리움，미안함、고마움\n본문.";
    assert_eq!(
        parse_report_bodies(raw).emotion_tags,
        tags(&["그리움", "미안함", "고마움"])
    );
}

#[test]
fn a_body_without_a_word_line_keeps_its_text_and_has_no_tags() {
    let raw = "@@emotions\n오늘 드러난 마음들은 자연스러운 감정이에요.\n사랑에서 나온 마음이에요.";
    let parsed = parse_report_bodies(raw);
    assert!(parsed.emotion_tags.is_empty());
    assert_eq!(
        parsed.emotions,
        "오늘 드러난 마음들은 자연스러운 감정이에요.\n사랑에서 나온 마음이에요."
    );
}

#[test]
fn a_sentence_with_commas_is_not_a_word_line() {
    let raw = "@@emotions 그리움, 미안함, 고마움이 모두 사랑에서 나온 마음이라는 것을 기억해 주세요.\n둘째 줄.";
    let parsed = parse_report_bodies(raw);
    assert!(parsed.emotion_tags.is_empty());
    assert_eq!(
        parsed.emotions,
        "그리움, 미안함, 고마움이 모두 사랑에서 나온 마음이라는 것을 기억해 주세요.\n둘째 줄."
    );
}

#[test]
fn a_single_word_without_a_comma_is_not_a_word_line() {
    let raw = "@@emotions\n그리움\n본문.";
    let parsed = parse_report_bodies(raw);
    assert!(parsed.emotion_tags.is_empty());
    assert_eq!(parsed.emotions, "그리움\n본문.");
}

#[test]
fn a_missing_emotions_section_has_no_tags() {
    let parsed = parse_report_bodies("@@journey 길, 걸음\n@@keepsake 기억, 하나");
    assert!(parsed.emotion_tags.is_empty());
}

#[test]
fn a_word_line_alone_gives_tags_and_an_empty_body() {
    let parsed = parse_report_bodies("@@emotions 그리움, 고마움\n@@keepsake 기억.");
    assert_eq!(parsed.emotion_tags, tags(&["그리움", "고마움"]));
    assert_eq!(parsed.emotions, "");
}
