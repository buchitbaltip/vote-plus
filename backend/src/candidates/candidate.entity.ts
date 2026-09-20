import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Vote } from '../votes/vote.entity.js';

@Entity({ name: 'candidates' })
export class Candidate {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Ballot number (1..N). This is the id the smart contract knows about:
   * `Voting.vote(number)`. Kept separate from the DB primary key so the two
   * systems are not accidentally coupled.
   */
  @Index({ unique: true })
  @Column({ type: 'smallint' })
  number: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 200 })
  slogan: string;

  @Column({ type: 'varchar', length: 100 })
  classroom: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  // One candidate -> many votes
  @OneToMany('Vote', (vote: Vote) => vote.candidate)
  votes?: Vote[];
}
