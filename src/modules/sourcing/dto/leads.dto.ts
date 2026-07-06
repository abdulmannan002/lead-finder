import { LeadStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '../../../common/pagination';

export class ListLeadsDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  /** Free-text search over company + domain. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  hasEmail?: boolean;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  firstLine?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;
}

export const BULK_ACTIONS = ['archive', 'do_not_contact'] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export class BulkLeadsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  ids!: string[];

  /** `enroll` arrives with campaigns in M3 (docs/04). */
  @IsIn(BULK_ACTIONS)
  action!: BulkAction;
}
