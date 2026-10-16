/**
 * ownership.ts — session ownership guard. Rejects access to sessions you don't own, but admins may view everything.
 */
import { ForbiddenException } from '@nestjs/common';

export interface Requester {
  id: string;
  isAdmin: boolean;
}

export const assertOwner = (ownerId: string, requester: Requester): void => {
  if (ownerId !== requester.id && !requester.isAdmin) {
    throw new ForbiddenException('Not the owner of this session');
  }
};
