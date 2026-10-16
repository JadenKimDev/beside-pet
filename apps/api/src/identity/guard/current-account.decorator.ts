/**
 * current-account.decorator.ts — receives the identity principal attached by the guard as a handler parameter.
 * The identity always derives from the verified token, never the request body.
 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedAccount } from './authenticated-account';

interface RequestWithAuth {
  account?: AuthenticatedAccount;
}

export const CurrentAccount = createParamDecorator(
  (_data: undefined, context: ExecutionContext): AuthenticatedAccount | undefined => {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    return request.account;
  },
);
