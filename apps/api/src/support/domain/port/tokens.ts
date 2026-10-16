/**
 * tokens.ts — DI tokens. Since TS interfaces disappear at runtime,
 * we explicitly define identifiers that NestJS uses when injecting port → adapter.
 * Abstractions (interfaces) live only in this port layer (no proliferation of repositories).
 */
export const LLM_PORT = Symbol('LlmPort');
export const KNOWLEDGE_PORT = Symbol('KnowledgePort');
export const SESSION_REPOSITORY = Symbol('SessionRepository');
