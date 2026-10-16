/**
 * role.ts — account role. Only admin can create/revoke accounts; viewer can only browse the portfolio.
 */
export type Role = 'admin' | 'viewer';

export const isAdmin = (role: Role): boolean => role === 'admin';
