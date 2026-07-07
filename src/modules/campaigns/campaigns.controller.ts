import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  CreateCampaignDto,
  ListCampaignsDto,
  PutStepsDto,
  UpdateCampaignDto,
} from './dto/campaigns.dto';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get()
  list(@Query() dto: ListCampaignsDto) {
    return this.campaigns.list(dto);
  }

  @Post()
  create(@Body() dto: CreateCampaignDto) {
    return this.campaigns.create(dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCampaignDto) {
    return this.campaigns.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.campaigns.remove(id);
  }

  /** FR-6.2 — full ordered replacement; T-12 validation inside. */
  @Put(':id/steps')
  setSteps(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PutStepsDto) {
    return this.campaigns.setSteps(id, dto);
  }
}
