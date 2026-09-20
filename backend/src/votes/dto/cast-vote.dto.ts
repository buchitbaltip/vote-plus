import { IsInt, Min } from 'class-validator';

export class CastVoteDto {
  /** Database id of the candidate (from GET /candidates). */
  @IsInt()
  @Min(1)
  candidateId: number;
}
