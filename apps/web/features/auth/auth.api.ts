/**
 * features/auth/auth.api.ts — real backend auth client (setup / register / login / me).
 * Routes only: the shared transport (lib/http) owns the base URL, the httpOnly
 * cookie credentials (the JWT never lives in JS), and error extraction.
 */
import type { Locale } from '@/i18n/config';
import { http } from '@/lib/http';
import type { Principal } from './auth.types';

export interface SetupStatus {
  required: boolean;
}

/** Is first-run admin setup still pending on the backend? */
export const setupStatus = (): Promise<SetupStatus> => http.get('/v1/auth/setup');

/** Exchange the one-time boot token for the first admin account (signs in). */
export const setup = (token: string, username: string, password: string): Promise<void> =>
  http.post('/v1/auth/setup', { token, username, password });

/** Public account application — creates a pending account awaiting admin approval. */
export const register = (username: string, password: string, company: string): Promise<void> =>
  http.post('/v1/auth/register', { username, password, company });

export const login = (username: string, password: string): Promise<void> =>
  http.post('/v1/auth/login', { username, password });

export const logout = (): Promise<void> => http.post('/v1/auth/logout');

export const me = (): Promise<Principal> => http.get('/v1/auth/me');

/** Set the account-level conversation language (independent of the UI locale). */
export const updateChatLanguage = (chatLanguage: Locale): Promise<Principal> =>
  http.patch('/v1/auth/me/chat-language', { chatLanguage });
