import { Controller, Get } from '@nestjs/common';

/** GET / -> quick liveness check + a map of the API. */
@Controller()
export class AppController {
  @Get()
  index() {
    return {
      name: 'Vote Plus API',
      status: 'ok',
      endpoints: {
        'POST /auth/register': 'create account -> { accessToken, user }',
        'POST /auth/login': 'sign in -> { accessToken, user }',
        'GET  /auth/me': 'current user (Bearer token)',
        'GET  /candidates': 'ballot',
        'POST /votes': 'cast ballot { candidateId } (Bearer token)',
        'GET  /votes/me': 'my ballot (Bearer token)',
        'GET  /votes/results': 'DB + on-chain tally + ledger',
        'GET  /votes/stream': 'same as results, as Server-Sent Events',
      },
    };
  }
}
