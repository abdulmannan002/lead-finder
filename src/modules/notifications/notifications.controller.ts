import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PageQueryDto } from '../../common/pagination';
import { NotificationsService } from './notifications.service';

class ListNotificationsDto extends PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  unread?: boolean;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** docs/04 — the in-app feed (with an unread counter for the badge). */
  @Get()
  list(@Query() dto: ListNotificationsDto) {
    return this.notifications.list(dto);
  }

  @HttpCode(200)
  @Post(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(id);
  }
}
