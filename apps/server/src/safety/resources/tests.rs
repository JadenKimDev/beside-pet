use serde_json::json;

use super::{crisis_reply, safety_resources};

#[test]
fn 자원_목록은_ts_와_같다() {
    let body = serde_json::to_value(safety_resources()).unwrap();
    assert_eq!(
        body,
        json!([
            {
                "name": "Suicide Prevention Hotline (Korea)",
                "phone": "109",
                "hours": "24h",
                "note": "Talk to a trained counselor right away."
            },
            {
                "name": "Danuri Helpline (multilingual)",
                "phone": "1577-1366",
                "hours": "24h",
                "note": "Support in several languages for residents in Korea."
            }
        ])
    );
}

#[test]
fn 위기_문구는_고정이고_자원의_번호를_싣는다() {
    assert_eq!(
        crisis_reply(),
        "It sounds like you're going through something very hard. You don't have to carry this alone — you can reach a counselor right now at 109 (24h), or the multilingual Danuri Helpline at 1577-1366."
    );
    for resource in safety_resources() {
        assert!(
            crisis_reply().contains(resource.phone),
            "{}",
            resource.phone
        );
    }
}
