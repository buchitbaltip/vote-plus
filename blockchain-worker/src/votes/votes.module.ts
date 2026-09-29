import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BlockchainModule } from '../blockchain/blockchain.module.js';
import { VoteConsumer } from './vote.consumer.js';
import { QUEUE_VOTE_RESULTS } from '../events/vote.events.js';

@Module({
  imports: [
    BlockchainModule,
    // ช่องทางขาออก: ผลลัพธ์ไหลกลับไปหา voting-service ผ่านคิวนี้
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
            queue: QUEUE_VOTE_RESULTS,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  controllers: [VoteConsumer],
})
export class VotesModule {}
