import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Vote } from '../votes/vote.entity.js';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // UNIQUE index at the database level: even two simultaneous registrations
  // with the same username cannot both succeed.
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  username: string;

  // Only the bcrypt hash is ever stored. `select: false` keeps it out of
  // normal queries so it can never leak through an API response by accident.
  @Column({ name: 'password_hash', type: 'varchar', length: 72, select: false })
  passwordHash: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // One user -> at most one vote (enforced by the UNIQUE FK on votes.user_id)
  @OneToOne('Vote', (vote: Vote) => vote.user)
  vote?: Vote;
}
