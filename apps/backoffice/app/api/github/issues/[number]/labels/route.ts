import { addLabelResponse } from '@/shared/github';

export const POST = async (request: Request, { params }: { params: Promise<{ number: string }> }) =>
  addLabelResponse((await params).number, request);
