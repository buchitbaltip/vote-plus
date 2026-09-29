import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app.module.js';
import { VOTE_CREATED } from './events/vote.events.js';

/**
 * This process has no HTTP server. It only consumes messages from RabbitMQ,
 * which is why it boots with createMicroservice instead of create.
 */
async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.RMQ,
      options: {
        urls: [process.env.RABBITMQ_URL ?? 'amqp://localhost:5672'],
        queue: VOTE_CREATED,
        // durable: the queue survives a broker restart, so pending work is
        // never lost just because RabbitMQ was restarted.
        queueOptions: { durable: true },
        // noAck: false means *we* decide when a message is done. A message is
        // only removed from the queue after the transaction is confirmed, so a
        // crash mid-flight puts the work back instead of dropping it.
        noAck: false,
      },
    },
  );

  await app.listen();
  new Logger('Bootstrap').log(`Worker listening on queue "${VOTE_CREATED}"`);
}

await bootstrap();
