import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import type { JwtPayload } from './jwt-payload.interface.js';

const BCRYPT_ROUNDS = 12;
// Postgres error code for unique_violation
const PG_UNIQUE_VIOLATION = '23505';
// A syntactically valid bcrypt hash that matches nothing. Used so login
// takes the same time whether or not the username exists.
const DUMMY_HASH =
  '$2b$12$C6UzMDM.H6dfI/f/IKcEeO5Qz3Wd2pQ4S1r7Zt7z0y2s3KpJt6bKm';

export interface AuthResponse {
  accessToken: string;
  user: { id: string; username: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(username: string, password: string): Promise<AuthResponse> {
    // Fast path: friendly 409 before we spend CPU on bcrypt.
    if (await this.usersService.findByUsername(username)) {
      throw new ConflictException(`Username "${username}" is already taken`);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const user = await this.usersService.create(username, passwordHash);
      return this.issueToken(user.id, user.username);
    } catch (err) {
      // Race: two requests registered the same name at the same time. The
      // UNIQUE index rejects the second one; translate that into a 409.
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(`Username "${username}" is already taken`);
      }
      throw err;
    }
  }

  async login(username: string, password: string): Promise<AuthResponse> {
    const user = await this.usersService.findByUsernameWithPassword(username);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new UnauthorizedException('Invalid username or password');
    }
    return this.issueToken(user.id, user.username);
  }

  private async issueToken(
    id: string,
    username: string,
  ): Promise<AuthResponse> {
    const payload: JwtPayload = { sub: id, username };
    const accessToken = await this.jwtService.signAsync(payload);
    return { accessToken, user: { id, username } };
  }
}
