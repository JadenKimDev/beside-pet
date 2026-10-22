import { publishResponse } from '../../../_lib/handlers';

export const POST = async (request: Request, { params }: { params: Promise<{ file: string }> }) =>
  publishResponse((await params).file, request);
