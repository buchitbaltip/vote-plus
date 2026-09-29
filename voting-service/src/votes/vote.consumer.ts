import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { VotesService } from './votes.service.js';
import {
  VOTE_CONFIRMED,
  VOTE_FAILED,
  type VoteConfirmedEvent,
  type VoteFailedEvent,
} from '../events/vote.events.js';

/**
 * ขาเข้าอีกทางของ voting-service นอกจาก HTTP
 *
 * service นี้จึงเป็นทั้ง API และ consumer ในตัวเดียว (Nest เรียกว่า hybrid app)
 * — รับ request จาก browser ทาง HTTP และรับผลจาก worker ทาง RabbitMQ
 */
@Controller()
export class VoteConsumer {
  private readonly logger = new Logger(VoteConsumer.name);

  constructor(private readonly votesService: VotesService) {}

  @EventPattern(VOTE_CONFIRMED)
  async onConfirmed(
    @Payload() event: VoteConfirmedEvent,
    @Ctx() ctx: unknown,
  ) {
    const context = ctx as RmqContext;
    this.logger.log(
      `${VOTE_CONFIRMED} vote=${event.voteId} block=${event.blockNumber}`,
    );
    await this.votesService.applyConfirmation(event);
    // ack หลังอัปเดต DB เสร็จ ถ้าพังก่อนหน้านี้ข้อความจะถูกส่งมาใหม่
    context.getChannelRef().ack(context.getMessage());
  }

  @EventPattern(VOTE_FAILED)
  async onFailed(@Payload() event: VoteFailedEvent, @Ctx() ctx: unknown) {
    const context = ctx as RmqContext;
    this.logger.warn(`${VOTE_FAILED} vote=${event.voteId}: ${event.reason}`);
    await this.votesService.applyFailure(event);
    context.getChannelRef().ack(context.getMessage());
  }
}
