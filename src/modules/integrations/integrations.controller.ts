import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  Put,
} from '@nestjs/common';
import { IntegrationKind, UserRole } from '@prisma/client';
import { Roles } from '../../common/guards/roles.decorator';
import { PutIntegrationDto } from './dto/integrations.dto';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService) {}

  @Get()
  list() {
    return this.integrations.list();
  }

  @Roles(UserRole.ADMIN)
  @Put(':kind')
  put(
    @Param('kind', new ParseEnumPipe(IntegrationKind)) kind: IntegrationKind,
    @Body() dto: PutIntegrationDto,
  ) {
    // docs/04 spells Telegram as { botToken, chatId }; canonical is { key, config }.
    const key = dto.key ?? dto.botToken;
    if (!key) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'key is required' });
    }
    const config = dto.chatId ? { ...(dto.config ?? {}), chatId: dto.chatId } : dto.config;
    return this.integrations.put(kind, key, config);
  }

  @Roles(UserRole.ADMIN)
  @Delete(':kind')
  remove(@Param('kind', new ParseEnumPipe(IntegrationKind)) kind: IntegrationKind) {
    return this.integrations.remove(kind);
  }
}
