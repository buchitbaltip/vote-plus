import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BlockchainModule } from '../blockchain/blockchain.module.js';
import { VoteConsumer } from './vote.consumer.js';
import { VOTE_CONFIRMED } from '../events/vote.events.js';

@Module({
  imports: [
    BlockchainModule,
    // Outbound channel: results flow back to voting-service on this queue.
    ClientsModule.registerAsync([
      {
        name: 'VOTE_EVENTS',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672'),
            ],
            queue: VOTE_CONFIRMED,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [VoteConsumer],
})
export class VotesModule {}
