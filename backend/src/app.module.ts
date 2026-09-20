import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { validateEnv } from './config/env.validation.js';
import { databaseConfig } from './config/database.config.js';
import { AuthModule } from './auth/auth.module.js';
import { CandidatesModule } from './candidates/candidates.module.js';
import { VotesModule } from './votes/votes.module.js';
import { BlockchainModule } from './blockchain/blockchain.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: databaseConfig,
    }),
    AuthModule,
    CandidatesModule,
    VotesModule,
    BlockchainModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
