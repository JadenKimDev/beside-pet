//! 모델 호출의 관문(`TextModel` trait). 어떤 모델을 쓰는지는 구현이 정한다. 프롬프트의 내용은 맡지 않는다.

mod text_model;

pub use text_model::{
    GenerationRequest, PromptMessage, PromptRole, SharedTextModel, TextModel, TextStream,
    Unimplemented,
};
