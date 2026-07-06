import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** docs/04: ?page=&limit= → { data, meta: { total, page, limit } } */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export function pageParams(dto: PageQueryDto): { page: number; limit: number; skip: number; take: number } {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 25;
  return { page, limit, skip: (page - 1) * limit, take: limit };
}

export function paged<T>(data: T[], total: number, page: number, limit: number) {
  return { data, meta: { total, page, limit } };
}
