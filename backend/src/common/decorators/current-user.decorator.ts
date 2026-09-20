import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../../auth/jwt-payload.interface.js';

/**
 * Pulls the user that JwtAuthGuard attached to the request.
 *
 *   @Get('me')
 *   me(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);
