/**
 * The message contract between voting-service and blockchain-worker.
 *
 * This file is duplicated in both services on purpose. A shared library would
 * couple their deployments: changing a field would force both to be released
 * together. Keeping a copy per service means each can be deployed on its own,
 * as long as changes stay backwards compatible.
 */

export const VOTE_CREATED = 'vote.created';
export const VOTE_CONFIRMED = 'vote.confirmed';
export const VOTE_FAILED = 'vote.failed';

/** voting-service -> worker: a ballot was stored and needs to reach the chain. */
export interface VoteCreatedEvent {
  voteId: string;
  candidateNumber: number;
}

/** worker -> voting-service: the transaction was mined. */
export interface VoteConfirmedEvent {
  voteId: string;
  txHash: string;
  blockNumber: number;
}

/** worker -> voting-service: the transaction could not be completed. */
export interface VoteFailedEvent {
  voteId: string;
  reason: string;
}
