import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity.js';
import { Candidate } from '../candidates/candidate.entity.js';

export enum VoteStatus {
  /** Sent to the chain, waiting to be mined. */
  PENDING = 'PENDING',
  /** Mined; txHash + blockNumber are final. */
  CONFIRMED = 'CONFIRMED',
  /** Tx reverted or was dropped. Kept for auditing. */
  FAILED = 'FAILED',
  /** Blockchain not configured; counted in the DB only. */
  OFF_CHAIN = 'OFF_CHAIN',
}

/**
 * One row per ballot cast.
 *
 *   users (1) --- (0..1) votes (N) --- (1) candidates
 *
 * The UNIQUE constraint on user_id is what makes "one vote per student" a
 * database guarantee rather than just application logic.
 */
@Entity({ name: 'votes' })
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.vote, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  @Index({ unique: true })
  user: User;

  @ManyToOne(() => Candidate, (candidate) => candidate.votes, {
    nullable: false,
    onDelete: 'RESTRICT',
    eager: true,
  })
  @JoinColumn({ name: 'candidate_id' })
  candidate: Candidate;

  @Column({ type: 'enum', enum: VoteStatus, default: VoteStatus.PENDING })
  status: VoteStatus;

  /** Sepolia transaction hash. NULL while OFF_CHAIN or before submission. */
  @Column({ name: 'tx_hash', type: 'varchar', length: 66, nullable: true })
  txHash: string | null;

  @Column({ name: 'block_number', type: 'integer', nullable: true })
  blockNumber: number | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
