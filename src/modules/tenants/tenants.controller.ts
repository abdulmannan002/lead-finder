import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { IsNotEmpty, IsString } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { Roles } from '../../common/guards/roles.decorator';
import { ChangeRoleDto, UpdateTenantDto } from './dto/tenants.dto';
import { TenantDeletionService } from './tenant-deletion.service';
import { TenantsService } from './tenants.service';

class DeleteTenantDto {
  /** docs/04 conventions — tenant deletion requires password re-entry. */
  @IsString()
  @IsNotEmpty()
  password!: string;
}

@Controller('tenant')
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly deletion: TenantDeletionService,
  ) {}

  /** FR-10.3 — soft delete with a 30-day purge window. OWNER only. */
  @Roles(UserRole.OWNER)
  @HttpCode(200)
  @Delete()
  remove(@CurrentUser() user: AuthUser, @Body() dto: DeleteTenantDto) {
    return this.deletion.softDelete(user, dto.password);
  }

  @Get()
  get() {
    return this.tenants.get();
  }

  @Roles(UserRole.ADMIN)
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateTenantDto) {
    return this.tenants.update(user, dto);
  }

  @Get('users')
  listMembers() {
    return this.tenants.listMembers();
  }

  @Roles(UserRole.OWNER)
  @Patch('users/:id')
  changeRole(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ChangeRoleDto) {
    return this.tenants.changeRole(id, dto.role);
  }

  @Roles(UserRole.ADMIN)
  @Delete('users/:id')
  removeMember(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tenants.removeMember(user, id);
  }
}
