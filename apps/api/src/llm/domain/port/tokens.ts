/**
 * tokens.ts — llm module DI tokens (domain-scoped enum).
 * Values are namespaced with the module name to avoid cross-module collisions.
 */
export enum LlmDiToken {
  TextModel = 'llm/TextModel',
  UsageSink = 'llm/UsageSink',
}
