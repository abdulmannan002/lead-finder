import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { PageQueryDto } from '../../common/pagination';
import { CreateRequestDto, RespondDto } from './dto/requests.dto';
import { RequestsService } from './requests.service';

/** MP-4..MP-6 — buyer requests (RFQ) and provider offers. */
@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateRequestDto) {
    return this.requests.create(user.tenantId, dto);
  }

  @Get('mine')
  mine(@Query() dto: PageQueryDto) {
    return this.requests.mine(dto);
  }

  /** The provider's lead feed: OPEN requests matched to their profile. */
  @Get('matched')
  matched(@CurrentUser() user: AuthUser, @Query() dto: PageQueryDto) {
    return this.requests.matchedFeed(user.tenantId, dto);
  }

  @HttpCode(201)
  @Post(':id/respond')
  respond(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondDto,
  ) {
    return this.requests.respond(user.tenantId, id, dto.pitch);
  }

  /** Buyer-only offer comparison (contact reveal per MP-6). */
  @Get(':id/responses')
  responses(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.requests.offers(user.tenantId, id);
  }

  @HttpCode(200)
  @Post(':id/close')
  close(@Param('id', ParseUUIDPipe) id: string) {
    return this.requests.close(id);
  }
}
