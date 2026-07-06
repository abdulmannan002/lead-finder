import { IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class PutIntegrationDto {
  /** The secret (API key / bot token). Write-only. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  key?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  /** docs/04 Telegram alias: { botToken, chatId } — normalized in the controller. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  botToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  chatId?: string;
}
