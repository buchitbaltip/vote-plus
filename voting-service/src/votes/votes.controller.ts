import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import { VotesService } from './votes.service.js';
import { CastVoteDto } from './dto/cast-vote.dto.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/jwt-payload.interface.js';

@Controller('votes')
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  /**
   * POST /votes  (ต้อง login)
   *  201 MyVote            รับบัตรลงคะแนนแล้ว (PENDING จนกว่าจะถูก mine)
   *  400                   body ไม่ผ่าน validation
   *  401                   ไม่มี token หรือ token ใช้ไม่ได้
   *  404                   ไม่มีผู้สมัครคนนี้
   *  409                   ผู้ใช้คนนี้โหวตไปแล้ว
   *  502                   blockchain ปฏิเสธ transaction
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  cast(@CurrentUser() user: JwtPayload, @Body() dto: CastVoteDto) {
    return this.votesService.castVote(user.sub, dto.candidateId);
  }

  /** GET /votes/me (ต้อง login) -> 200 MyVote | null */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.votesService.getMyVote(user.sub);
  }

  /** GET /votes/results (public) -> 200 ResultsPayload */
  @Get('results')
  results() {
    return this.votesService.getResults();
  }

  /**
   * GET /votes/stream (public, text/event-stream)
   * Server-Sent Events: pushes a ResultsPayload on connect and after every
   * vote. The dashboard subscribes with `new EventSource(...)`.
   */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.votesService
      .stream()
      .pipe(map((data) => ({ data }) as MessageEvent));
  }
}
