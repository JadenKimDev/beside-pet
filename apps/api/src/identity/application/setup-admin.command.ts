/**
 * setup-admin.command.ts — input for SetupAdminUseCase (first-run bootstrap).
 */
export interface SetupAdminCommand {
  token: string;
  username: string;
  password: string;
  company?: string;
}
