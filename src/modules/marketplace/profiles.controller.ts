import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { Public } from '../../common/guards/public.decorator';
import { DirectoryQueryDto, UpsertProfileDto } from './dto/profiles.dto';
import { ProfilesService } from './profiles.service';

/** Authenticated: the workspace's own marketplace profile (MP-1). */
@Controller('business-profile')
export class ProfileController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  async getMine() {
    return (await this.profiles.getMine()) ?? { exists: false };
  }

  @Put()
  upsert(@Body() dto: UpsertProfileDto) {
    return this.profiles.upsertMine(dto);
  }

  @HttpCode(200)
  @Post('generate-description')
  generateDescription() {
    return this.profiles.generateDescription();
  }
}

/** Public, unauthenticated marketplace surfaces (MP-2). */
@Controller('public')
export class PublicDirectoryController {
  constructor(private readonly profiles: ProfilesService) {}

  @Public()
  @Get('directory')
  directory(@Query() dto: DirectoryQueryDto) {
    return this.profiles.directory(dto);
  }

  @Public()
  @Get('businesses/:slug')
  profile(@Param('slug') slug: string) {
    return this.profiles.publicProfile(slug);
  }
}
