import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { Public } from '../../common/guards/public.decorator';
import { Roles } from '../../common/guards/roles.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, SignupDto, SwitchTenantDto } from './dto/auth.dto';
import { IsNotEmpty, IsString } from 'class-validator';
import { AcceptInviteDto, InviteDto } from './dto/invite.dto';
import { InvitationsService } from './invitations.service';
import { VerificationService } from './verification.service';

class ConfirmVerifyDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/** docs/03 §6 — auth endpoints: 5/min per IP. */
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly invitations: InvitationsService,
    private readonly verification: VerificationService,
  ) {}

  /** FR-1.1 — creates global User + Tenant + OWNER membership. */
  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto.email, dto.password, dto.tenantName, dto.ref);
  }

  @Public()
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  /** FR-1.6 — membership-verified workspace switch. */
  @HttpCode(200)
  @Post('switch-tenant')
  switchTenant(@CurrentUser() user: AuthUser, @Body() dto: SwitchTenantDto) {
    return this.auth.switchTenant(user.userId, dto.tenantId);
  }

  /** FR-1.3 — Owner/Admin invites an email with a role. */
  @Roles(UserRole.ADMIN)
  @Post('invite')
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteDto) {
    return this.invitations.invite(user, dto.email, dto.role);
  }

  /** FR-1.3 — existing users skip the password step. */
  @Public()
  @HttpCode(200)
  @Post('accept-invite')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.invitations.accept(dto.token, dto.password);
  }

  /** MP-3 — email verification for the directory trust badge. */
  @HttpCode(200)
  @Post('verify-email/request')
  requestVerification(@CurrentUser() user: AuthUser) {
    return this.verification.request(user.userId);
  }

  @Public()
  @HttpCode(200)
  @Post('verify-email/confirm')
  confirmVerification(@Body() dto: ConfirmVerifyDto) {
    return this.verification.confirm(dto.token);
  }
}
