import { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../users/user.entity.js';
import { Candidate } from '../candidates/candidate.entity.js';
import { Vote } from '../votes/vote.entity.js';

/**
 * Builds the TypeORM connection from either DATABASE_URL (cloud Postgres
 * such as Neon / Supabase) or the DB_* variables (local server).
 */
export function databaseConfig(config: ConfigService): TypeOrmModuleOptions {
  const url = config.get<string>('DATABASE_URL');
  const sslFlag = config.get<string>('DB_SSL');
  const ssl =
    sslFlag === 'true' || (sslFlag === undefined && url?.includes('sslmode=require'));

  const connection = url
    ? { url }
    : {
        host: config.getOrThrow<string>('DB_HOST'),
        port: config.getOrThrow<number>('DB_PORT'),
        username: config.getOrThrow<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.getOrThrow<string>('DB_NAME'),
      };

  return {
    type: 'postgres',
    ...connection,
    // Cloud providers terminate TLS with certs that node's CA store may not
    // trust out of the box; encryption is still on.
    ssl: ssl ? { rejectUnauthorized: false } : false,
    entities: [User, Candidate, Vote],
    // Dev convenience: TypeORM creates/alters tables from the entities.
    // For production you would switch this off and use migrations.
    synchronize: config.get('NODE_ENV') !== 'production',
    logging: config.get('DB_LOGGING') === 'true',
  };
}
