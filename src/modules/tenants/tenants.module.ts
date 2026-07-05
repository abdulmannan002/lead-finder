import { Module } from '@nestjs/common';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

// tenant CRUD, user roles, kill switch, config (docs/03 §3)
@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService],
})
export class TenantsModule {}
