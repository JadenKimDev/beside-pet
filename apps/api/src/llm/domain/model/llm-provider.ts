/**
 * llm-provider.ts — the set of wired text-model vendors.
 * Adding a vendor = one enum value + one provider adapter + a pricing row.
 */
export enum LlmProvider {
  Anthropic = 'anthropic',
}

const PROVIDER_VALUES: readonly string[] = Object.values(LlmProvider);

export const isLlmProvider = (value: string): value is LlmProvider =>
  PROVIDER_VALUES.includes(value);
