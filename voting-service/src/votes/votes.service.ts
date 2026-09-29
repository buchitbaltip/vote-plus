import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ClientProxy } from '@nestjs/microservices';
import { Not, Repository } from 'typeorm';
import { Observable, Subject, defer, from, merge } from 'rxjs';
import { Vote, VoteStatus } from './vote.entity.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { BlockchainService } from '../blockchain/blockchain.service.js';
import {
  VOTE_CREATED,
  type VoteConfirmedEvent,
  type VoteFailedEvent,
} from '../events/vote.events.js';
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

  /** ทุกครั้งที่คะแนนเปลี่ยน จะ push ResultsPayload ชุดใหม่ลงตรงนี้ (ใช้กับ SSE) */
  private readonly results$ = new Subject<ResultsPayload>();

  constructor(
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    private readonly candidatesService: CandidatesService,
    /** ใช้อ่านคะแนนบน chain อย่างเดียว เขียนไม่ได้ (ไม่มี private key) */
    private readonly blockchain: BlockchainService,
    /** ช่องทางส่งงานไปให้ blockchain-worker ผ่าน RabbitMQ */
    @Inject('VOTE_EVENTS') private readonly client: ClientProxy,
  ) {}

  // ---------------------------------------------------------------------
  // Business logic: ลงคะแนน
  // ---------------------------------------------------------------------

  /**
   * ลำดับการทำงาน:
   *  1. ผู้สมัครต้องมีอยู่จริง                            -> 404
   *  2. ผู้ใช้ต้องยังไม่เคยโหวต                           -> 409
   *  3. INSERT vote (PENDING) โดย UNIQUE(user_id) คือด่านจริงที่กันโหวตซ้ำ
   *     กรณีที่ 2 request เข้ามาพร้อมกัน                  -> ชนแล้วตอบ 409
   *  4. โยน event `vote.created` เข้าคิว แล้วตอบ 201 ทันที
   *
   * service นี้ไม่ส่ง transaction เองอีกต่อไป — blockchain-worker จะมารับงาน
   * จากคิวไปทำ แล้วส่งผลกลับมาทาง `vote.confirmed` / `vote.failed`
   * (ดูเมธอด applyConfirmation / applyFailure ด้านล่าง)
   */
  async castVote(userId: string, candidateId: number): Promise<MyVote> {
    const candidate = await this.candidatesService.findOne(candidateId);

    if (await this.findByUser(userId)) {
      throw new ConflictException('You have already voted');
    }

    // ตอนนี้ยังไม่รู้ว่า worker จะส่งขึ้น chain ได้หรือไม่ จึงตั้งเป็น PENDING
    // ไว้ก่อนเสมอ ถ้า worker รันในโหมด OFF_CHAIN มันจะแจ้งกลับมาเอง
    let vote: Vote;
    try {
      vote = await this.votes.save(
        this.votes.create({
          user: { id: userId },
          candidate,
          status: VoteStatus.PENDING,
        }),
      );
    } catch (err) {
      if ((err as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException('You have already voted');
      }
      throw err;
    }

    // emit = ยิงแล้วไม่รอคำตอบ ต่างจาก send ที่เป็น request-response
    // ตรงนี้คือจุดที่ 2 service คุยกัน และเป็นเหตุผลที่ user ไม่ต้องรอ 12 วินาที
    this.client.emit(VOTE_CREATED, {
      voteId: vote.id,
      candidateNumber: candidate.number,
    });
    this.logger.log(
      `ส่ง ${VOTE_CREATED} เข้าคิวแล้ว vote=${vote.id} เบอร์=${candidate.number}`,
    );

    void this.broadcast();
    return this.toMyVote(vote);
  }

  /** worker แจ้งว่า tx ถูก mine แล้ว */
  async applyConfirmation(event: VoteConfirmedEvent) {
    await this.votes.update(
      { id: event.voteId },
      {
        status: VoteStatus.CONFIRMED,
        txHash: event.txHash,
        blockNumber: event.blockNumber,
      },
    );
    // คะแนนบน chain เพิ่งเปลี่ยน แคชเดิมใช้ไม่ได้แล้ว
    this.blockchain.invalidateTallyCache();
    await this.broadcast();
  }

  /** worker แจ้งว่าส่ง tx ไม่สำเร็จ */
  async applyFailure(event: VoteFailedEvent) {
    await this.votes.update(
      { id: event.voteId },
      { status: VoteStatus.FAILED, errorMessage: event.reason },
    );
    await this.broadcast();
  }

  // ---------------------------------------------------------------------
  // การอ่านข้อมูล
  // ---------------------------------------------------------------------

  async findByUser(userId: string): Promise<Vote | null> {
    return this.votes.findOne({ where: { user: { id: userId } } });
  }

  async getMyVote(userId: string): Promise<MyVote | null> {
    const vote = await this.findByUser(userId);
    return vote ? this.toMyVote(vote) : null;
  }

  /** รวมคะแนนจาก DB + คะแนนบน chain + ประวัติล่าสุด ไว้ใน payload เดียว */
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
   * SSE stream: ส่งผลคะแนนปัจจุบัน 1 ครั้งทันทีที่ต่อเข้ามา
   * หลังจากนั้นส่งทุกครั้งที่มีคนโหวตหรือมี tx ถูกยืนยัน
   */
  stream(): Observable<ResultsPayload> {
    return merge(
      defer(() => from(this.getResults())),
      this.results$.asObservable(),
    );
  }

  // ---------------------------------------------------------------------
  // ฟังก์ชันช่วย
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
