import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { CreateQueryDto, ListQueriesDto, UpdateQueryDto } from './dto/sourcing.dto';
import { QueriesService } from './queries.service';

@Controller()
export class SourcingController {
  constructor(private readonly queries: QueriesService) {}

  @Get('queries')
  list(@Query() dto: ListQueriesDto) {
    return this.queries.list(dto);
  }

  @Post('queries')
  create(@Body() dto: CreateQueryDto) {
    return this.queries.create(dto);
  }

  @Patch('queries/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateQueryDto) {
    return this.queries.update(id, dto);
  }

  @Delete('queries/:id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.queries.remove(id);
  }

  /** FR-3.2 — manual trigger → { runId }. */
  @Post('queries/:id/run')
  run(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.queries.run(user.tenantId, id, idempotencyKey);
  }

  @Get('runs/:id')
  getRun(@Param('id', ParseUUIDPipe) id: string) {
    return this.queries.getRun(id);
  }
}
