import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Candidate } from './candidate.entity.js';
import { CANDIDATE_SEED } from './candidates.seed.js';

@Injectable()
export class CandidatesService implements OnModuleInit {
  private readonly logger = new Logger(CandidatesService.name);

  constructor(
    @InjectRepository(Candidate)
    private readonly candidates: Repository<Candidate>,
  ) {}

  /** Seed the ballot on first boot so the app is usable out of the box. */
  async onModuleInit() {
    if ((await this.candidates.count()) > 0) return;
    await this.candidates.save(this.candidates.create([...CANDIDATE_SEED]));
    this.logger.log(`Seeded ${CANDIDATE_SEED.length} candidates`);
  }

  findAll(): Promise<Candidate[]> {
    return this.candidates.find({ order: { number: 'ASC' } });
  }

  async findOne(id: number): Promise<Candidate> {
    const candidate = await this.candidates.findOne({ where: { id } });
    if (!candidate) {
      throw new NotFoundException(`Candidate ${id} not found`);
    }
    return candidate;
  }
}
