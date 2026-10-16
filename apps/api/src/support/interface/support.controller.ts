/**
 * support.controller.ts — thin HTTP surface for support. Login required; identity is derived from the token.
 *  POST   /v1/sessions               start a session → first reply (owner = logged-in account)
 *  POST   /v1/sessions/:id/messages  one user turn → TurnResult
 *  DELETE /v1/sessions/:id           erase the conversation (right to erasure)
 *  GET    /v1/sessions/:id           current state (resume)
 *  GET    /v1/sessions/:id/messages  conversation history
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthenticatedAccount } from '@/identity/guard/authenticated-account';
import { CurrentAccount } from '@/identity/guard/current-account.decorator';
import { JwtAuthGuard } from '@/identity/guard/jwt-auth.guard';
import { CloseSessionUseCase } from '../application/close-session.usecase';
import { DeleteSessionUseCase } from '../application/delete-session.usecase';
import type { Requester } from '../application/ownership';
import { SendMessageUseCase } from '../application/send-message.usecase';
import { StartSessionUseCase } from '../application/start-session.usecase';
import { SupportQuery } from '../application/support.query';
import { MessageResponse } from './dto/message.response';
import { MindReportResponse } from './dto/mind-report.response';
import { SendMessageRequest } from './dto/send-message.request';
import { SessionAnalysisResponse } from './dto/session-analysis.response';
import { SessionListItemResponse } from './dto/session-list-item.response';
import { SessionStateResponse } from './dto/session-state.response';
import { StartSessionRequest } from './dto/start-session.request';
import { TurnResponse } from './dto/turn.response';
import { pipeSse } from './sse-writer';

const requesterOf = (account: AuthenticatedAccount): Requester => ({
  id: account.id,
  isAdmin: account.role === 'admin',
});

@ApiTags('support')
@ApiCookieAuth()
@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SupportController {
  constructor(
    private readonly startSession: StartSessionUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly closeSession: CloseSessionUseCase,
    private readonly deleteSession: DeleteSessionUseCase,
    private readonly query: SupportQuery,
  ) {}

  @Post()
  @HttpCode(201)
  start(
    @Body() body: StartSessionRequest,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<TurnResponse> {
    return this.startSession.execute({
      sessionId: body.sessionId,
      ownerId: account.id,
      griefProfile: body.griefProfile,
    });
  }

  @Post('stream')
  @HttpCode(200)
  @ApiOkResponse({
    description:
      'Server-sent events: one JSON TurnEvent per frame — meta, then token(s), then done.',
  })
  startStream(
    @Body() body: StartSessionRequest,
    @CurrentAccount() account: AuthenticatedAccount,
    @Res() res: Response,
  ): Promise<void> {
    const events = this.startSession.stream({
      sessionId: body.sessionId,
      ownerId: account.id,
      griefProfile: body.griefProfile,
    });
    return pipeSse(res, events);
  }

  @Post(':id/messages')
  @HttpCode(200)
  message(
    @Param('id') id: string,
    @Body() body: SendMessageRequest,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<TurnResponse> {
    return this.sendMessage.execute({
      sessionId: id,
      text: body.text,
      requester: requesterOf(account),
    });
  }

  @Post(':id/messages/stream')
  @HttpCode(200)
  @ApiOkResponse({
    description:
      'Server-sent events: one JSON TurnEvent per frame — meta, then token(s), then done.',
  })
  messageStream(
    @Param('id') id: string,
    @Body() body: SendMessageRequest,
    @CurrentAccount() account: AuthenticatedAccount,
    @Res() res: Response,
  ): Promise<void> {
    const events = this.sendMessage.stream({
      sessionId: id,
      text: body.text,
      requester: requesterOf(account),
    });
    return pipeSse(res, events);
  }

  @Post(':id/close')
  @HttpCode(200)
  async close(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<SessionStateResponse> {
    const requester = requesterOf(account);
    await this.closeSession.execute({ sessionId: id, requester });
    return this.query.state(id, requester);
  }

  /** Erases the conversation, its report, and its analyses. Irreversible. */
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentAccount() account: AuthenticatedAccount): Promise<void> {
    return this.deleteSession.execute({ sessionId: id, requester: requesterOf(account) });
  }

  @Get()
  list(@CurrentAccount() account: AuthenticatedAccount): Promise<SessionListItemResponse[]> {
    return this.query.listForOwner(requesterOf(account));
  }

  @Get(':id')
  state(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<SessionStateResponse> {
    return this.query.state(id, requesterOf(account));
  }

  @Get(':id/messages')
  history(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<MessageResponse[]> {
    return this.query.history(id, requesterOf(account));
  }

  @Get(':id/analysis')
  analysis(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<SessionAnalysisResponse> {
    return this.query.analysis(id, requesterOf(account));
  }

  @Get(':id/report')
  report(
    @Param('id') id: string,
    @CurrentAccount() account: AuthenticatedAccount,
  ): Promise<MindReportResponse> {
    return this.query.report(id, requesterOf(account));
  }
}
