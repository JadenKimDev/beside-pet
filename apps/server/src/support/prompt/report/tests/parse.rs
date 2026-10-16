// `@@marker` 파서: 네 구역의 본문을 가른다. 빠진 구역은 빈 글이다.

use super::super::{ReportBodies, parse_report_bodies};
use crate::support::ReportSectionKey;

fn bodies(journey: &str, emotions: &str, keepsake: &str, encouragement: &str) -> ReportBodies {
    ReportBodies {
        journey: journey.to_owned(),
        emotions: emotions.to_owned(),
        keepsake: keepsake.to_owned(),
        encouragement: encouragement.to_owned(),
    }
}

#[test]
fn all_four_sections_in_order_are_split_and_trimmed() {
    let raw = "@@journey\n오늘 걸어온 길.\n\n@@emotions 느낌들.\n@@keepsake\n  기억 하나.  \n@@encouragement\n다정한 한 줄.\n";
    assert_eq!(
        parse_report_bodies(raw),
        bodies("오늘 걸어온 길.", "느낌들.", "기억 하나.", "다정한 한 줄.")
    );
}

#[test]
fn sections_out_of_order_still_land_in_their_keys() {
    let raw = "@@encouragement 끝.\n@@keepsake 기억.\n@@journey 길.\n@@emotions 마음.";
    assert_eq!(
        parse_report_bodies(raw),
        bodies("길.", "마음.", "기억.", "끝.")
    );
}

#[test]
fn a_missing_marker_leaves_that_section_empty() {
    let raw = "@@journey 길.\n@@keepsake 기억.\n@@encouragement 끝.";
    assert_eq!(parse_report_bodies(raw), bodies("길.", "", "기억.", "끝."));
}

#[test]
fn an_empty_section_stays_empty_and_does_not_swallow_the_next() {
    let raw = "@@journey\n   \n@@emotions 마음.\n@@keepsake@@encouragement 끝.";
    assert_eq!(parse_report_bodies(raw), bodies("", "마음.", "", "끝."));
}

#[test]
fn text_before_the_first_marker_is_dropped() {
    let raw = "Here is your report:\n@@journey 길.";
    assert_eq!(parse_report_bodies(raw), bodies("길.", "", "", ""));
}

#[test]
fn no_markers_give_four_empty_sections() {
    assert_eq!(parse_report_bodies("그냥 글."), ReportBodies::default());
    assert_eq!(parse_report_bodies(""), ReportBodies::default());
}

#[test]
fn a_repeated_marker_keeps_its_first_body() {
    let raw = "@@journey 첫째.\n@@journey 둘째.";
    assert_eq!(parse_report_bodies(raw).journey, "첫째.");
}

#[test]
fn a_marker_word_glued_to_letters_does_not_end_a_section() {
    // TS 의 `\b`: `@@emotionsX` 는 다음 구역의 시작이 아니다.
    let raw = "@@journey 길 @@emotionsX 이어짐.\n@@emotions 마음.";
    assert_eq!(parse_report_bodies(raw).journey, "길 @@emotionsX 이어짐.");
}

#[test]
fn a_body_is_read_by_section_key() {
    let parsed = bodies("길.", "마음.", "기억.", "끝.");
    assert_eq!(parsed.get(ReportSectionKey::Journey), "길.");
    assert_eq!(parsed.get(ReportSectionKey::Emotions), "마음.");
    assert_eq!(parsed.get(ReportSectionKey::Keepsake), "기억.");
    assert_eq!(parsed.get(ReportSectionKey::Encouragement), "끝.");
}
