import { QueryStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PageQueryDto } from '../../../common/pagination';

export class CreateQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  searchString!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxResults?: number;
}

export class UpdateQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  searchString?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  maxResults?: number;
}

export class ListQueriesDto extends PageQueryDto {
  @IsOptional()
  @IsEnum(QueryStatus)
  status?: QueryStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}
