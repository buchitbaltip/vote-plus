import type { ChainInfo } from '../blockchain/blockchain.service.js';
import type { VoteStatus } from './vote.entity.js';

export interface CandidateResult {
  id: number;
  number: number;
  name: string;
  slogan: string;
  classroom: string;
  /** คะแนนที่นับจาก PostgreSQL (ทุก status ยกเว้น FAILED) */
  dbVotes: number;
  /** คะแนนที่อ่านจาก smart contract ด้วย getVotes() เป็น null ถ้าปิด chain หรือต่อไม่ได้ */
  chainVotes: number | null;
}

export interface LedgerEntry {
  id: string;
  candidateNumber: number;
  candidateName: string;
  status: VoteStatus;
  txHash: string | null;
  blockNumber: number | null;
  createdAt: string;
}

export interface ResultsPayload {
  candidates: CandidateResult[];
  totalDbVotes: number;
  totalChainVotes: number | null;
  chain: ChainInfo & { error: string | null };
  /** บัตรลงคะแนนล่าสุด เรียงใหม่ไปเก่า ไม่เปิดเผยตัวตนผู้โหวต */
  ledger: LedgerEntry[];
  generatedAt: string;
}

export interface MyVote {
  id: string;
  candidateId: number;
  candidateNumber: number;
  candidateName: string;
  status: VoteStatus;
  txHash: string | null;
  blockNumber: number | null;
  createdAt: string;
}
