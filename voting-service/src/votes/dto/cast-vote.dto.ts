import { IsInt, Min } from 'class-validator';

export class CastVoteDto {
  /** id ของผู้สมัครในฐานข้อมูล (ได้มาจาก GET /candidates) */
  @IsInt()
  @Min(1)
  candidateId: number;
}
