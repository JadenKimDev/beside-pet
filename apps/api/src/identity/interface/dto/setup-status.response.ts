/**
 * setup-status.response.ts — GET /v1/auth/setup response body.
 */
export class SetupStatusResponse {
  /** True while first-run setup is still pending (no admin account yet). */
  required!: boolean;
}
