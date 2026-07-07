import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { EnrollDto, ListEnrollmentsDto } from './dto/enrollments.dto';
import { EnrollmentsService } from './enrollments.service';

@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  /** FR-6.3 — { leadIds } or { filter } → { enrolled, skipped[reason] }. */
  @HttpCode(200)
  @Post('campaigns/:id/enroll')
  enroll(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EnrollDto) {
    return this.enrollments.enroll(id, dto);
  }

  @Get('campaigns/:id/enrollments')
  list(@Param('id', ParseUUIDPipe) id: string, @Query() dto: ListEnrollmentsDto) {
    return this.enrollments.list(id, dto);
  }

  @HttpCode(200)
  @Post('enrollments/:id/stop')
  stop(@Param('id', ParseUUIDPipe) id: string) {
    return this.enrollments.stop(id);
  }
}
