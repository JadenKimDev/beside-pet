/**
 * i18n/walk.ts — flattens a catalog into (path, text) pairs for the data checks.
 * Function-valued entries are called with sentinel arguments (`⟦0⟧`, `⟦1⟧`, …)
 * so their placeholders can be compared across locales.
 */

export interface CatalogEntry {
  path: string;
  text: string;
  /** Sentinels found in the text, sorted. Empty for plain strings. */
  placeholders: string[];
  /** Number of arguments the entry takes; 0 for plain strings. */
  arity: number;
}

export const sentinel = (index: number): string => `⟦${index}⟧`;

const SENTINEL_PATTERN = /⟦\d+⟧/g;

export const walkCatalog = (node: unknown, path = ''): CatalogEntry[] => {
  if (typeof node === 'string') {
    return [{ path, text: node, placeholders: [], arity: 0 }];
  }
  if (typeof node === 'function') {
    const arity = node.length;
    const args = Array.from({ length: arity }, (_, index) => sentinel(index));
    const text = String(node(...args));
    const placeholders = [...(text.match(SENTINEL_PATTERN) ?? [])].sort();
    return [{ path, text, placeholders, arity }];
  }
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) =>
      walkCatalog(value, path ? `${path}.${key}` : key),
    );
  }
  return [];
};
