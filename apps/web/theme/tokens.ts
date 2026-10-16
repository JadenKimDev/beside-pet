/**
 * theme/tokens.ts — reads the colour tokens of one theme out of the
 * `app/globals.css` source, for the contrast test. A theme block is
 * `html[data-theme="<key>"] { …light… @media (prefers-color-scheme: dark) { …dark… } }`.
 */

export type TokenMap = Record<string, string>;

/** Returns the body between the `{` at `open` and its matching `}`. */
const blockBody = (css: string, open: number): string => {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('unbalanced braces in globals.css');
};

const hexDeclarations = (body: string): TokenMap => {
  const tokens: TokenMap = {};
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (m[1] && m[2]) tokens[m[1]] = m[2].toUpperCase();
  }
  return tokens;
};

export const readThemeTokens = (
  css: string,
  theme: string,
): { light: TokenMap; dark: TokenMap } => {
  const selector = new RegExp(`html\\[data-theme="${theme}"\\][^{]*\\{`);
  const found = selector.exec(css);
  if (!found) return { light: {}, dark: {} };
  const body = blockBody(css, found.index + found[0].length - 1);
  const media = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/.exec(body);
  if (!media) return { light: hexDeclarations(body), dark: {} };
  const mediaOpen = media.index + media[0].length - 1;
  const darkBody = blockBody(body, mediaOpen);
  const lightBody = body.slice(0, media.index) + body.slice(mediaOpen + darkBody.length + 2);
  return { light: hexDeclarations(lightBody), dark: hexDeclarations(darkBody) };
};
