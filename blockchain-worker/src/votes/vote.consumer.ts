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
 * Entry point of this service. It plays the same role a controller does in an
 * HTTP app, except requests arrive from a queue instead of a socket.
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
    // Nest types extra handler arguments as `unknown`, so the context is
    // narrowed here instead of in the signature.
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

      // Only now is the work really done, so only now is the message removed
      // from the queue. A crash before this line means RabbitMQ redelivers it.
      channel.ack(message);
    } catch (err) {
      const reason = (err as Error).message;
      this.logger.error(`vote=${event.voteId} failed: ${reason}`);

      this.client.emit(VOTE_FAILED, { voteId: event.voteId, reason });

      // requeue=false: do not spin on a message that keeps failing. With a
      // dead-letter exchange configured it lands in the DLQ for inspection.
      channel.nack(message, false, false);
    }
  }
}
