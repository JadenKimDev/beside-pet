/**
 * create-account.command.ts — input for CreateAccountUseCase (admin-issued account).
 */
import type { Role } from '@/identity/domain/model/role';

export interface CreateAccountCommand {
  username: string;
  password: string;
  company: string;
  role?: Role;
  expiresAt?: string;
}
