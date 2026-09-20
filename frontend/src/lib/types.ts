export interface AuthUser {
  id: string;
  username: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface Candidate {
  id: number;
  number: number;
  name: string;
  slogan: string;
  classroom: string;
}

export type VoteStatus = "PENDING" | "CONFIRMED" | "FAILED" | "OFF_CHAIN";

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

export interface CandidateResult extends Candidate {
  dbVotes: number;
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

export interface ChainInfo {
  enabled: boolean;
  chainId: number | null;
  networkName: string | null;
  contractAddress: string | null;
  backendWallet: string | null;
  explorerUrl: string;
  error: string | null;
}

export interface ResultsPayload {
  candidates: CandidateResult[];
  totalDbVotes: number;
  totalChainVotes: number | null;
  chain: ChainInfo;
  ledger: LedgerEntry[];
  generatedAt: string;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string | string[];
}
