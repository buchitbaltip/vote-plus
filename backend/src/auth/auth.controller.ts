import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from './jwt-payload.interface.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /auth/register -> 201 { accessToken, user } | 409 if username taken */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto.username, dto.password);
  }

  /** POST /auth/login -> 200 { accessToken, user } | 401 on bad credentials */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  /** GET /auth/me -> 200 { id, username } | 401 without a valid token */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return { id: user.sub, username: user.username };
  }
}
