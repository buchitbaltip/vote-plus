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
  /** ส่งขึ้น chain แล้ว กำลังรอ mine */
  PENDING = 'PENDING',
  /** ถูก mine แล้ว txHash + blockNumber เป็นค่าสุดท้าย */
  CONFIRMED = 'CONFIRMED',
  /** tx โดน revert หรือหลุดไป เก็บไว้เพื่อตรวจสอบย้อนหลัง */
  FAILED = 'FAILED',
  /** ไม่ได้ตั้งค่า blockchain นับคะแนนใน DB อย่างเดียว */
  OFF_CHAIN = 'OFF_CHAIN',
}

/**
 * 1 แถว = บัตรลงคะแนน 1 ใบ
 *
 *   users (1) --- (0..1) votes (N) --- (1) candidates
 *
 * UNIQUE constraint บน user_id คือสิ่งที่ทำให้กติกา "1 คน 1 เสียง" เป็นการ
 * การันตีระดับ database ไม่ใช่แค่ logic ในแอป
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

  /** hash ของ transaction บน Sepolia เป็น NULL ตอน OFF_CHAIN หรือก่อนส่ง */
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
