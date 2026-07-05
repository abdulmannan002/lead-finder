import { Body, Controller, Get, Post } from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { WorkspacesService } from './workspaces.service';

class CreateWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;
}

@Controller()
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  /** FR-1.6 — create an additional workspace; caller becomes its OWNER. */
  @Post('tenants')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateWorkspaceDto) {
    return this.workspaces.create(user.userId, dto.name);
  }

  /** FR-1.6 — memberships for the tenant switcher. */
  @Get('me/tenants')
  listMine(@CurrentUser() user: AuthUser) {
    return this.workspaces.listMine(user.userId);
  }
}
