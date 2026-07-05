import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';

export class InviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}

export class AcceptInviteDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  /** Omitted when the invitee already has an account (FR-1.3). */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password?: string;
}
