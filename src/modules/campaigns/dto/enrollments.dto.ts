import { EnrollmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../../common/pagination';
import { ListLeadsDto } from '../../sourcing/dto/leads.dto';

/** docs/04 — enroll by explicit ids or by lead filter (FR-6.3). */
export class EnrollDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID(undefined, { each: true })
  leadIds?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ListLeadsDto)
  filter?: ListLeadsDto;
}

export class ListEnrollmentsDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(EnrollmentStatus)
  status?: EnrollmentStatus;
}
