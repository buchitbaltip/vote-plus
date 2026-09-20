import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { CandidatesService } from './candidates.service.js';

/** Public: anyone can see who is on the ballot. */
@Controller('candidates')
export class CandidatesController {
  constructor(private readonly candidatesService: CandidatesService) {}

  /** GET /candidates -> 200 Candidate[] */
  @Get()
  findAll() {
    return this.candidatesService.findAll();
  }

  /** GET /candidates/:id -> 200 Candidate | 400 non-numeric id | 404 unknown */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.candidatesService.findOne(id);
  }
}
