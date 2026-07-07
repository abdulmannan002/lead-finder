import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(3000)
  description!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsBoolean()
  remoteOk?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  budget?: string;
}

export class RespondDto {
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  pitch!: string;
}
