//! 요청 본문의 검증. class-validator(Nest 의 ValidationPipe, whitelist + forbidNonWhitelisted)와 같은 문구를 낸다.
//!
//! 쓰는 법: 칸마다 규칙을 TS 의 데코레이터를 위에서 아래로 적은 순서로 넘긴다(`@IsOptional` 은 `optional`).
//! 문구의 순서는 class-validator 를 따른다: 그 객체의 모르는 칸(본문의 순서) → 선언한 칸(선언 순서)이고,
//! 한 칸 안에서는 뒤에 적은 규칙의 문구가 먼저다. 중첩 객체의 문구에는 `부모.` 를 앞에 붙인다.
//!
//! ```text
//! fn login(v: Validator<'_>) -> Validator<'_> {
//!     v.required("username", &[Rule::IsString, Rule::IsNotEmpty])
//!         .required("password", &[Rule::IsString, Rule::IsNotEmpty])
//! }
//! login(Validator::new(&body)).finish()?;
//! ```

mod iso8601;

use serde_json::{Map, Value};

use super::{ApiError, Message};

/// 칸 하나에 거는 규칙. 이름은 class-validator 의 데코레이터와 같다.
#[derive(Debug, Clone, Copy)]
pub enum Rule {
    IsString,
    IsNotEmpty,
    MinLength(usize),
    MaxLength(usize),
    /// `@IsIn([...])`. 문자열 값만 비교한다.
    IsIn(&'static [&'static str]),
    IsInt,
    Min(i64),
    IsIso8601,
}

/// 중첩 객체의 규칙을 쌓는 함수. 이름 있는 `fn` 으로 둔다(배열이면 원소마다 다시 부른다).
pub type Nested = for<'b> fn(Validator<'b>) -> Validator<'b>;

/// 본문 하나(JSON 객체)의 검사를 쌓고 문구를 모은다.
pub struct Validator<'a> {
    object: Option<&'a Map<String, Value>>,
    declared: Vec<&'static str>,
    messages: Vec<String>,
}

impl<'a> Validator<'a> {
    /// 객체가 아닌 본문은 빈 객체처럼 본다(모든 칸이 없다).
    pub fn new(body: &'a Value) -> Validator<'a> {
        Validator {
            object: body.as_object(),
            declared: Vec::new(),
            messages: Vec::new(),
        }
    }

    /// 꼭 있어야 하는 칸.
    pub fn required(self, name: &'static str, rules: &[Rule]) -> Validator<'a> {
        self.field(name, rules, false)
    }

    /// `@IsOptional`: 없거나 `null` 이면 규칙을 건너뛴다.
    pub fn optional(self, name: &'static str, rules: &[Rule]) -> Validator<'a> {
        self.field(name, rules, true)
    }

    /// `@ValidateNested` 인 꼭 있어야 하는 칸.
    pub fn nested(self, name: &'static str, build: Nested) -> Validator<'a> {
        self.nested_field(name, build, false)
    }

    /// `@IsOptional @ValidateNested` 인 칸.
    pub fn nested_optional(self, name: &'static str, build: Nested) -> Validator<'a> {
        self.nested_field(name, build, true)
    }

    /// 모은 문구. 모르는 칸의 문구가 먼저다.
    pub fn messages(&self) -> Vec<String> {
        let mut out: Vec<String> = self
            .object
            .into_iter()
            .flat_map(|object| object.keys())
            .filter(|key| !self.declared.contains(&key.as_str()))
            .map(|key| format!("property {key} should not exist"))
            .collect();
        out.extend(self.messages.iter().cloned());
        out
    }

    /// 문구가 없으면 `Ok`, 있으면 `400` 과 문구의 배열.
    pub fn finish(self) -> Result<(), ApiError> {
        let messages = self.messages();
        if messages.is_empty() {
            Ok(())
        } else {
            Err(ApiError::BadRequest(Message::Many(messages)))
        }
    }

    fn value(&self, name: &str) -> Option<&'a Value> {
        self.object.and_then(|object| object.get(name))
    }

    fn field(mut self, name: &'static str, rules: &[Rule], optional: bool) -> Validator<'a> {
        self.declared.push(name);
        let value = self.value(name);
        if optional && is_absent(value) {
            return self;
        }
        for rule in rules.iter().rev() {
            if !passes(*rule, value) {
                self.messages.push(message(*rule, name));
            }
        }
        self
    }

    fn nested_field(mut self, name: &'static str, build: Nested, optional: bool) -> Validator<'a> {
        self.declared.push(name);
        let value = self.value(name);
        if optional && is_absent(value) {
            return self;
        }
        match value {
            Some(Value::Array(items)) => {
                for (index, item) in items.iter().enumerate() {
                    match item {
                        Value::Object(_) => {
                            let prefix = format!("{name}.{index}.");
                            self.push_nested(&prefix, build, item);
                        }
                        // class-validator 는 배열 안의 객체가 아닌 원소에도 부모 칸의 이름을 쓴다.
                        _ => self.messages.push(format!("{name}.{}", not_object(name))),
                    }
                }
            }
            Some(item @ Value::Object(_)) => {
                let prefix = format!("{name}.");
                self.push_nested(&prefix, build, item);
            }
            _ => self.messages.push(not_object(name)),
        }
        self
    }

    fn push_nested(&mut self, prefix: &str, build: Nested, item: &Value) {
        let inner = build(Validator::new(item)).messages();
        self.messages
            .extend(inner.into_iter().map(|m| format!("{prefix}{m}")));
    }
}

fn not_object(name: &str) -> String {
    format!("nested property {name} must be either object or array")
}

fn is_absent(value: Option<&Value>) -> bool {
    matches!(value, None | Some(Value::Null))
}

fn passes(rule: Rule, value: Option<&Value>) -> bool {
    let text = value.and_then(Value::as_str);
    match rule {
        Rule::IsString => text.is_some(),
        Rule::IsNotEmpty => !is_absent(value) && text != Some(""),
        Rule::MinLength(min) => text.is_some_and(|t| js_length(t) >= min),
        Rule::MaxLength(max) => text.is_some_and(|t| js_length(t) <= max),
        Rule::IsIn(allowed) => text.is_some_and(|t| allowed.contains(&t)),
        Rule::IsInt => value.and_then(Value::as_number).is_some_and(|n| {
            n.is_i64()
                || n.is_u64()
                || n.as_f64()
                    .is_some_and(|f| f.is_finite() && f.fract() == 0.0)
        }),
        Rule::Min(min) => value
            .and_then(Value::as_f64)
            .is_some_and(|f| f >= min as f64),
        Rule::IsIso8601 => text.is_some_and(iso8601::is_iso8601),
    }
}

fn message(rule: Rule, name: &str) -> String {
    match rule {
        Rule::IsString => format!("{name} must be a string"),
        Rule::IsNotEmpty => format!("{name} should not be empty"),
        Rule::MinLength(n) => format!("{name} must be longer than or equal to {n} characters"),
        Rule::MaxLength(n) => format!("{name} must be shorter than or equal to {n} characters"),
        Rule::IsIn(allowed) => {
            format!(
                "{name} must be one of the following values: {}",
                allowed.join(", ")
            )
        }
        Rule::IsInt => format!("{name} must be an integer number"),
        Rule::Min(n) => format!("{name} must not be less than {n}"),
        Rule::IsIso8601 => format!("{name} must be a valid ISO 8601 date string"),
    }
}

/// validator.js 의 `isLength` 와 같이 센다: 코드 포인트 수에서, 다른 글자 뒤에 붙은 변형 선택자(U+FE0E, U+FE0F)를 뺀다.
fn js_length(text: &str) -> usize {
    let is_selector = |c: char| c == '\u{fe0e}' || c == '\u{fe0f}';
    let mut count = 0;
    let mut previous: Option<char> = None;
    for c in text.chars() {
        if !(is_selector(c) && previous.is_some_and(|p| !is_selector(p))) {
            count += 1;
        }
        previous = Some(c);
    }
    count
}

#[cfg(test)]
mod tests;
