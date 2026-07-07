import { Module } from '@nestjs/common';
import { TenantDeletionService } from './tenant-deletion.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { WorkspacesController } from './workspaces.controller';
import { WorkspacesService } from './workspaces.service';

// tenant CRUD, user roles, kill switch, config (docs/03 §3)
@Module({
  controllers: [TenantsController, WorkspacesController],
  providers: [TenantsService, WorkspacesService, TenantDeletionService],
  exports: [TenantDeletionService],
})
export class TenantsModule {}
