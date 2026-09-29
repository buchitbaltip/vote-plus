import { Controller, Inject, Logger } from '@nestjs/common';
import {
  ClientProxy,
  Ctx,
  EventPattern,
  Payload,
  RmqContext,
} from '@nestjs/microservices';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import {
  VOTE_CONFIRMED,
  VOTE_CREATED,
  VOTE_FAILED,
  type VoteCreatedEvent,
} from '../events/vote.events.js';

/**
 * ประตูทางเข้าของ service นี้ ทำหน้าที่เหมือน controller ในแอป HTTP
 * ต่างกันแค่ว่า "request" มาจากคิวแทนที่จะมาจาก socket
 */
@Controller()
export class VoteConsumer {
  private readonly logger = new Logger(VoteConsumer.name);

  constructor(
    private readonly blockchain: BlockchainService,
    @Inject('VOTE_EVENTS') private readonly client: ClientProxy,
  ) {}

  @EventPattern(VOTE_CREATED)
  async handleVoteCreated(
    @Payload() event: VoteCreatedEvent,
    // Nest ประกาศ argument ตัวที่เหลือของ handler เป็น `unknown`
    // จึงมา narrow type ตรงนี้แทนที่จะใส่ใน signature
    @Ctx() ctx: unknown,
  ) {
    const context = ctx as RmqContext;
    const channel = context.getChannelRef();
    const message = context.getMessage();

    this.logger.log(
      `received ${VOTE_CREATED} vote=${event.voteId} candidate=${event.candidateNumber}`,
    );

    try {
      const receipt = await this.blockchain.castVote(event.candidateNumber);

      this.client.emit(VOTE_CONFIRMED, {
        voteId: event.voteId,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
      });

      // ถึงตรงนี้งานถึงจะเสร็จจริง ข้อความจึงเพิ่งถูกลบออกจากคิวตอนนี้
      // ถ้า process ตายก่อนบรรทัดนี้ RabbitMQ จะส่งข้อความกลับมาให้ทำใหม่
      channel.ack(message);
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error(`vote=${event.voteId} failed: ${reason}`);

      this.client.emit(VOTE_FAILED, { voteId: event.voteId, reason });

      // requeue=false: ไม่วนทำข้อความที่ล้มซ้ำ ๆ ไม่รู้จบ ถ้าตั้ง
      // dead-letter exchange ไว้ ข้อความจะตกไปที่ DLQ ให้คนมาตรวจ
      channel.nack(message, false, false);
    }
  }
}
