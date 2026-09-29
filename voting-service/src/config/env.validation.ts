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
 * ตรวจ environment variable ครั้งเดียวตอน start ด้วย class-validator ตัวเดียว
 * กับที่ใช้ตรวจ DTO ของ request ถ้าพิมพ์ผิดใน .env จะพังทันทีพร้อมข้อความที่
 * อ่านรู้เรื่อง แทนที่จะไปพังแบบงง ๆ ตอน runtime ทีหลัง
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
  // เลือกอย่างใดอย่างหนึ่ง: DATABASE_URL เส้นเดียว (Neon / Supabase / Railway
  // ให้มาแบบนี้) หรือใส่ DB_* ทีละตัวสำหรับ server ในเครื่อง
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

  // ว่างได้ ถ้า Postgres ในเครื่องตั้งเป็น trust auth
  @IsOptional()
  @IsString()
  DB_PASSWORD?: string = '';

  @ValidateIf((o) => !o.DATABASE_URL)
  @IsString()
  DB_NAME?: string;

  /** บังคับใช้ TLS (สำหรับ cloud) เปิดให้อัตโนมัติถ้า DATABASE_URL มี sslmode=require */
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

  // --- Message broker ---
  @IsOptional()
  @IsString()
  RABBITMQ_URL = 'amqp://localhost:5672';

  // --- Blockchain (อ่านอย่างเดียว) ---
  // ไม่มี BACKEND_WALLET_PRIVATE_KEY ที่นี่แล้ว — key ย้ายไปอยู่ที่
  // blockchain-worker ที่เดียว service นี้จึงเขียนลง chain ไม่ได้เลย
  @IsOptional()
  @IsUrl({ require_tld: false })
  RPC_URL?: string;

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
  // ค่าที่เป็นสตริงว่าง (เช่น `VOTING_CONTRACT_ADDRESS=`) ให้ถือว่าไม่ได้ตั้ง
  // เพื่อให้ปล่อยค่า optional ว่างไว้ใน .env ได้
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
