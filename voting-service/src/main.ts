import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { QUEUE_VOTE_RESULTS } from './events/vote.events.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:3000'),
  });

  // ทุก @Body() จะถูกตรวจกับ DTO ของมัน `whitelist` ตัด field แปลกปลอมทิ้ง
  // ส่วน `transform` แปลง string เป็น number/boolean ตามที่ DTO ประกาศไว้
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  // ผูก consumer เข้ากับแอปเดียวกัน (Nest เรียกว่า hybrid application)
  // ทำให้ process นี้รับได้ทั้ง HTTP request จาก browser และข้อความจาก RabbitMQ
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
      queue: QUEUE_VOTE_RESULTS,
      queueOptions: { durable: true },
      // ack เองหลังอัปเดต DB เสร็จ เพื่อไม่ให้ผลจาก worker หายกลางทาง
      noAck: false,
    },
  });
  await app.startAllMicroservices();

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  new Logger('Bootstrap').log(`API listening on http://localhost:${port}`);
}
await bootstrap();
