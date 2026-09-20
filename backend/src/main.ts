import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({ origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000') });

  // Every @Body() is validated against its DTO. `whitelist` strips unknown
  // fields, `transform` converts strings to numbers/booleans per the DTO.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}`);
}
await bootstrap();
