import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  /** The tenant-level kill switch (FR-6.5). */
  @IsOptional()
  @IsBoolean()
  sendingEnabled?: boolean;
}

export class ChangeRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
