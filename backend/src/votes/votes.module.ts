import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vote } from './vote.entity.js';
import { VotesController } from './votes.controller.js';
import { VotesService } from './votes.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { CandidatesModule } from '../candidates/candidates.module.js';
import { BlockchainModule } from '../blockchain/blockchain.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Vote]),
    AuthModule,
    CandidatesModule,
    BlockchainModule,
  ],
  controllers: [VotesController],
  providers: [VotesService],
})
export class VotesModule {}
