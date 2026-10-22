import { sessionResponse } from '../_lib/handlers';

export const POST = (request: Request) => sessionResponse(request);
