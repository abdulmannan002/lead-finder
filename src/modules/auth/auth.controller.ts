import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { Public } from '../../common/guards/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, SignupDto, SwitchTenantDto } from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** FR-1.1 — creates global User + Tenant + OWNER membership. */
  @Public()
  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto.email, dto.password, dto.tenantName);
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
}
