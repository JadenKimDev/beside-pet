import { messageResponse } from '../../../_lib/handlers';

export const POST = async (request: Request, { params }: { params: Promise<{ id: string }> }) =>
  messageResponse((await params).id, request);
