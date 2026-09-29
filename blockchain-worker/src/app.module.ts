import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VotesModule } from './votes/votes.module.js';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), VotesModule],
})
export class AppModule {}
