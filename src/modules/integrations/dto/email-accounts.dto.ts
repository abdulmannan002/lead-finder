import { AccountStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ConnectSmtpDto {
  @IsEmail()
  address!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  host!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsString()
  @MaxLength(255)
  user!: string;

  @IsString()
  @MaxLength(255)
  pass!: string;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  /** M4 — reply detection reads this mailbox (defaults: SMTP host, 993). */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  imapHost?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fromName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signature?: string;

  /** FR-2.3 — protects domain reputation; enforced server-side (rule 4). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  dailyCap?: number;
}

const PATCHABLE_STATUSES: AccountStatus[] = [
  AccountStatus.ACTIVE,
  AccountStatus.WARMUP,
  AccountStatus.DISABLED,
];

export class UpdateEmailAccountDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  dailyCap?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fromName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  signature?: string;

  /** ERROR is system-set (revoked creds etc.), not user-settable. */
  @IsOptional()
  @IsIn(PATCHABLE_STATUSES)
  status?: AccountStatus;
}
