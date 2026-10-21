/**
 * features/auth/auth.redirect.ts — sends the browser to the first screen (sign-in).
 * A hard replace, not the Next router: the auth store lives outside React. Split
 * out so tests can stand in for navigation (jsdom's location cannot be spied on).
 */
export function goHome(): void {
  if (window.location.pathname !== '/') window.location.replace('/');
}
