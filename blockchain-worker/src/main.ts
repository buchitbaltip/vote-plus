import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import { QUEUE_VOTE_TASKS } from './events/vote.events.js';

/**
 * process นี้ไม่มี HTTP server เลย ทำหน้าที่รับข้อความจาก RabbitMQ อย่างเดียว
 * จึง boot ด้วย createMicroservice แทน create
 */
async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
        queue: QUEUE_VOTE_TASKS,
        // durable: คิวอยู่รอดแม้ RabbitMQ restart งานที่ค้างอยู่จึงไม่หาย
        queueOptions: { durable: true },
        // noAck: false = "เรา" เป็นคนบอกเองว่างานเสร็จ ข้อความจะถูกลบออกจากคิว
        // ก็ต่อเมื่อ transaction ยืนยันแล้ว ถ้า process ตายกลางทาง งานจะกลับ
        // เข้าคิวให้ทำใหม่ ไม่หายไปเฉย ๆ
        noAck: false,
      },
    },
  );

  await app.listen();
  new Logger('Bootstrap').log(`Worker listening on queue "${QUEUE_VOTE_TASKS}"`);
}

await bootstrap();
