import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { Roles } from '../../common/guards/roles.decorator';
import { ChangeRoleDto, UpdateTenantDto } from './dto/tenants.dto';
import { TenantsService } from './tenants.service';

@Controller('tenant')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

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
