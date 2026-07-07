import { CampaignStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../../common/pagination';

/** FR-6.1 schedule window (M3 ruling): days 0–6 (Sun–Sat), hour range, optional tz. */
export class ScheduleWindowDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  days!: number[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  startHour!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  endHour!: number;

  /** Defaults to the tenant's timezone. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  offerText?: string;

  @IsOptional()
  @IsUUID()
  emailAccountId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleWindowDto)
  scheduleWindow?: ScheduleWindowDto;
}

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  offerText?: string;

  @IsOptional()
  @IsUUID()
  emailAccountId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduleWindowDto)
  scheduleWindow?: ScheduleWindowDto;

  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}

export class StepDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  subjectTpl!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10_000)
  bodyTpl!: string;

  /** Delay in days from the previous step (step 1 is day 0). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(90)
  delayDays!: number;

  @IsOptional()
  @IsBoolean()
  threaded?: boolean;
}

export class PutStepsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => StepDto)
  steps!: StepDto[];
}

export class ListCampaignsDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(CampaignStatus)
  status?: CampaignStatus;
}
