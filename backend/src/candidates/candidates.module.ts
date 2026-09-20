import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Candidate } from './candidate.entity.js';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesService } from './candidates.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Candidate])],
  controllers: [CandidatesController],
  providers: [CandidatesService],
  exports: [CandidatesService],
})
export class CandidatesModule {}
