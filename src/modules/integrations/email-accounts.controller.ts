import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotImplementedException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../common/guards/roles.decorator';
import { ConnectSmtpDto, UpdateEmailAccountDto } from './dto/email-accounts.dto';
import { EmailAccountsService } from './email-accounts.service';

@Controller('email-accounts')
export class EmailAccountsController {
  constructor(private readonly accounts: EmailAccountsService) {}

  @Get()
  list() {
    return this.accounts.list();
  }

  @Roles(UserRole.ADMIN)
  @Post('smtp')
  connectSmtp(@Body() dto: ConnectSmtpDto) {
    return this.accounts.connectSmtp(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmailAccountDto) {
    return this.accounts.update(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @HttpCode(200)
  @Post(':id/test')
  sendTest(@Param('id', ParseUUIDPipe) id: string) {
    return this.accounts.sendTest(id);
  }

  /** M3 ruling: Gmail OAuth ships with the pilot (needs a Google Cloud app). */
  @Get('gmail/oauth-url')
  gmailOauthUrl(): never {
    throw new NotImplementedException({
      code: 'NOT_IMPLEMENTED',
      message: 'Gmail OAuth arrives with the pilot — connect via SMTP for now',
    });
  }

  @Get('gmail/callback')
  gmailCallback(): never {
    throw new NotImplementedException({
      code: 'NOT_IMPLEMENTED',
      message: 'Gmail OAuth arrives with the pilot — connect via SMTP for now',
    });
  }
}
