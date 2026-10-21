/**
 * lib/api/errors.ts — what the backend's refusals mean for the conversation.
 * The status codes stay here, at the port, so stores ask a question instead of
 * comparing numbers.
 */
import { HttpError } from '@/lib/http';

/** The status the backend answers when a session already received a `turnId`. */
export const TURN_ALREADY_RECEIVED_STATUS = 409;

/** True when the server already has this turn (a resend of a turn that did arrive). */
export const isTurnAlreadyReceived = (error: unknown): boolean =>
  error instanceof HttpError && error.status === TURN_ALREADY_RECEIVED_STATUS;

/** True when the server answered with an error status — the request did arrive, so a
 * silent retry would not help (unlike a dropped connection). */
export const isServerRefusal = (error: unknown): boolean => error instanceof HttpError;
