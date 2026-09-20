import {
  BadGatewayException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Observable, Subject, defer, from, merge } from 'rxjs';
import { Vote, VoteStatus } from './vote.entity.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import type {
  CandidateResult,
  LedgerEntry,
  MyVote,
  ResultsPayload,
} from './results.types.js';

const PG_UNIQUE_VIOLATION = '23505';
const LEDGER_SIZE = 20;

@Injectable()
export class VotesService {
  private readonly logger = new Logger(VotesService.name);

  /** Every change to the tally pushes a fresh ResultsPayload here (SSE). */
  private readonly results$ = new Subject<ResultsPayload>();

  constructor(
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    private readonly candidatesService: CandidatesService,
    private readonly blockchain: BlockchainService,
  ) {}

  // ---------------------------------------------------------------------
  // Business logic: cast a ballot
  // ---------------------------------------------------------------------

  /**
   * Flow:
   *  1. Candidate must exist                          -> 404
   *  2. User must not have voted                      -> 409
   *  3. INSERT vote (PENDING). UNIQUE(user_id) is the real guard against a
   *     double-vote race.                             -> 409 on violation
   *  4. Send vote(candidateNumber) to the contract.
   *       - success: store txHash, return 201 immediately (status PENDING)
   *       - failure: delete the row so the student can retry -> 502
   *  5. In the background wait for the receipt, flip to CONFIRMED/FAILED and
   *     broadcast the new tally to every SSE subscriber.
   */
  async castVote(userId: string, candidateId: number): Promise<MyVote> {
    const candidate = await this.candidatesService.findOne(candidateId);

    if (await this.findByUser(userId)) {
      throw new ConflictException('You have already voted');
    }

    let vote: Vote;
    try {
      vote = await this.votes.save(
        this.votes.create({
          user: { id: userId },
          candidate,
          status: this.blockchain.enabled
            ? VoteStatus.PENDING
            : VoteStatus.OFF_CHAIN,
        }),
      );
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('You have already voted');
      }
      throw err;
    }

    if (this.blockchain.enabled) {
      try {
        const submitted = await this.blockchain.castVote(candidate.number);
        vote.txHash = submitted.txHash;
        vote = await this.votes.save(vote);
        void this.trackConfirmation(vote.id, submitted.confirmation);
      } catch (err) {
        // Chain rejected the send (out of gas, RPC down, not owner...).
        // Roll back the DB row so the ballot is not lost.
        await this.votes.delete({ id: vote.id });
        this.logger.error(
          `vote(${candidate.number}) submission failed: ${(err as Error).message}`,
        );
        throw new BadGatewayException(
          'Could not submit vote to the blockchain, please try again',
        );
      }
    }

    void this.broadcast();
    return this.toMyVote(vote);
  }

  private async trackConfirmation(
    voteId: string,
    confirmation: Promise<{ blockNumber: number }>,
  ) {
    try {
      const receipt = await confirmation;
      await this.votes.update(
        { id: voteId },
        { status: VoteStatus.CONFIRMED, blockNumber: receipt.blockNumber },
      );
    } catch (err) {
      await this.votes.update(
        { id: voteId },
        { status: VoteStatus.FAILED, errorMessage: (err as Error).message },
      );
    }
    void this.broadcast();
  }

  // ---------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------

  async findByUser(userId: string): Promise<Vote | null> {
    return this.votes.findOne({ where: { user: { id: userId } } });
  }

  async getMyVote(userId: string): Promise<MyVote | null> {
    const vote = await this.findByUser(userId);
    return vote ? this.toMyVote(vote) : null;
  }

  /** DB tally + on-chain tally + recent ledger, in one payload. */
  async getResults(): Promise<ResultsPayload> {
    const [candidates, counts, ledgerRows, chainVotes] = await Promise.all([
      this.candidatesService.findAll(),
      this.countByCandidate(),
      this.votes.find({
        order: { createdAt: 'DESC' },
        take: LEDGER_SIZE,
      }),
      this.readChainVotes(),
    ]);

    const results: CandidateResult[] = candidates.map((c) => ({
      id: c.id,
      number: c.number,
      name: c.name,
      slogan: c.slogan,
      classroom: c.classroom,
      dbVotes: counts.get(c.id) ?? 0,
      chainVotes: chainVotes.tally ? (chainVotes.tally[c.number - 1] ?? 0) : null,
    }));

    return {
      candidates: results,
      totalDbVotes: results.reduce((sum, c) => sum + c.dbVotes, 0),
      totalChainVotes: chainVotes.tally
        ? chainVotes.tally.reduce((a, b) => a + b, 0)
        : null,
      chain: { ...this.blockchain.getChainInfo(), error: chainVotes.error },
      ledger: ledgerRows.map((v) => this.toLedgerEntry(v)),
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * SSE stream: emits the current results once on connect, then every time
   * a vote is cast or confirmed.
   */
  stream(): Observable<ResultsPayload> {
    return merge(
      defer(() => from(this.getResults())),
      this.results$.asObservable(),
    );
  }

  // ---------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------

  private async countByCandidate(): Promise<Map<number, number>> {
    const rows = await this.votes
      .createQueryBuilder('vote')
      .select('vote.candidate_id', 'candidateId')
      .addSelect('COUNT(*)', 'count')
      .where({ status: Not(VoteStatus.FAILED) })
      .groupBy('vote.candidate_id')
      .getRawMany<{ candidateId: number; count: string }>();
    return new Map(rows.map((r) => [Number(r.candidateId), Number(r.count)]));
  }

  private async readChainVotes(): Promise<{
    tally: number[] | null;
    error: string | null;
  }> {
    if (!this.blockchain.enabled) return { tally: null, error: null };
    try {
      return { tally: await this.blockchain.getVotes(), error: null };
    } catch (err) {
      this.logger.warn(`getVotes() failed: ${(err as Error).message}`);
      return { tally: null, error: (err as Error).message };
    }
  }

  private async broadcast() {
    try {
      this.results$.next(await this.getResults());
    } catch (err) {
      this.logger.error(`broadcast failed: ${(err as Error).message}`);
    }
  }

  private toMyVote(vote: Vote): MyVote {
    return {
      id: vote.id,
      candidateId: vote.candidate.id,
      candidateNumber: vote.candidate.number,
      candidateName: vote.candidate.name,
      status: vote.status,
      txHash: vote.txHash,
      blockNumber: vote.blockNumber,
      createdAt: vote.createdAt.toISOString(),
    };
  }

  private toLedgerEntry(vote: Vote): LedgerEntry {
    return {
      id: vote.id,
      candidateNumber: vote.candidate.number,
      candidateName: vote.candidate.name,
      status: vote.status,
      txHash: vote.txHash,
      blockNumber: vote.blockNumber,
      createdAt: vote.createdAt.toISOString(),
    };
  }
}
