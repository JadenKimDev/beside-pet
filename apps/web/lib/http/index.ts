/**
 * lib/http — the app's single configured HTTP client.
 * This is the ONE place the backend base URL is read; every api module imports
 * `http` from here rather than reading the environment itself.
 */
import { createHttpClient } from './client';

/** Inlined at build time by Next (NEXT_PUBLIC_*); defaults to the local backend. */
const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

export const http = createHttpClient({ baseUrl: BASE_URL });

export type { HttpClient } from './client';
