import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { Vote } from './vote.entity.js';
import { VotesController } from './votes.controller.js';
import { VoteConsumer } from './vote.consumer.js';
import { VotesService } from './votes.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { CandidatesModule } from '../candidates/candidates.module.js';
import { BlockchainModule } from '../blockchain/blockchain.module.js';
import { QUEUE_VOTE_TASKS } from '../events/vote.events.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vote]),
    AuthModule,
    CandidatesModule,
    BlockchainModule,
    // ช่องทางขาออก: ส่งงานไปให้ blockchain-worker ผ่านคิว vote.tasks
    ClientsModule.registerAsync([
      {
        name: 'VOTE_EVENTS',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL', 'amqp://localhost:5672')],
            queue: QUEUE_VOTE_TASKS,
            queueOptions: { durable: true },
          },
        }),
      },
    ]),
  ],
  // VotesController = ขาเข้าทาง HTTP, VoteConsumer = ขาเข้าทาง RabbitMQ
  controllers: [VotesController, VoteConsumer],
  providers: [VotesService],
})
export class VotesModule {}
