import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from './jwt-payload.interface.js';

/**
 * Authorization guard. Any route decorated with @UseGuards(JwtAuthGuard)
 * requires a valid `Authorization: Bearer <token>` header.
 *
 * On success the decoded payload is attached to `request.user` so handlers
 * can read it with the @CurrentUser() decorator. On failure Nest returns 401
 * before the handler ever runs.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token');
    }

    try {
      request.user = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    return scheme === 'Bearer' ? token : undefined;
  }
}
