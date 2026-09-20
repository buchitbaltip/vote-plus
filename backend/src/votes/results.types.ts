import type { ChainInfo } from '../blockchain/blockchain.service.js';
import type { VoteStatus } from './vote.entity.js';

export interface CandidateResult {
  id: number;
  number: number;
  name: string;
  slogan: string;
  classroom: string;
  /** Votes counted in PostgreSQL (all statuses except FAILED). */
  dbVotes: number;
  /** Votes read from the smart contract via getVotes(); null if chain disabled/unreachable. */
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
  /** Most recent ballots, newest first. No voter identity is exposed. */
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
