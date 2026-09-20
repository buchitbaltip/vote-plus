import { plainToInstance, Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

/**
 * Environment variables are validated once at startup with the same
 * class-validator approach used for request DTOs. A typo in .env fails fast
 * with a readable message instead of a confusing runtime error later.
 */
export class EnvironmentVariables {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsOptional()
  @IsString()
  CORS_ORIGIN = 'http://localhost:3000';

  // --- PostgreSQL ---
  // Either a single DATABASE_URL (Neon / Supabase / Railway give you one)
  // or the individual DB_* fields for a local server.
  @ValidateIf((o) => !o.DB_HOST)
  @IsString()
  @Matches(/^postgres(ql)?:\/\//, {
    message: 'DATABASE_URL must start with postgres:// or postgresql://',
  })
  DATABASE_URL?: string;

  @ValidateIf((o) => !o.DATABASE_URL)
  @IsString()
  DB_HOST?: string;

  @ValidateIf((o) => !o.DATABASE_URL)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT?: number;

  @ValidateIf((o) => !o.DATABASE_URL)
  @IsString()
  DB_USER?: string;

  // May be empty for local trust auth
  @IsOptional()
  @IsString()
  DB_PASSWORD?: string = '';

  @ValidateIf((o) => !o.DATABASE_URL)
  @IsString()
  DB_NAME?: string;

  /** Force TLS (cloud providers). Auto-enabled when DATABASE_URL has sslmode=require. */
  @IsOptional()
  @IsBooleanString()
  DB_SSL?: string;

  // --- Auth ---
  @IsString()
  @MinLength(16, { message: 'JWT_SECRET must be at least 16 characters' })
  JWT_SECRET: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN = '1d';

  // --- Blockchain (all optional: app runs in OFF_CHAIN mode without them) ---
  @IsOptional()
  @IsUrl({ require_tld: false })
  RPC_URL?: string;

  @IsOptional()
  @Matches(/^0x[0-9a-fA-F]{64}$/, {
    message: 'BACKEND_WALLET_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key',
  })
  BACKEND_WALLET_PRIVATE_KEY?: string;

  @IsOptional()
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'VOTING_CONTRACT_ADDRESS must be a 0x-prefixed 20-byte address',
  })
  VOTING_CONTRACT_ADDRESS?: string;

  @IsOptional()
  @IsUrl()
  EXPLORER_URL = 'https://sepolia.etherscan.io';
}

export function validateEnv(config: Record<string, unknown>) {
  // Treat blank values (e.g. `VOTING_CONTRACT_ADDRESS=`) as unset so
  // optional settings can be left empty in .env.
  const cleaned = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== ''),
  );
  const validated = plainToInstance(EnvironmentVariables, cleaned);
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .flatMap((e) => Object.values(e.constraints ?? {}))
      .join('\n  - ');
    throw new Error(`Invalid environment configuration:\n  - ${messages}`);
  }
  return validated;
}
