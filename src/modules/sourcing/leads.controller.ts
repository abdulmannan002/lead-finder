import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { EnrollmentsService } from '../campaigns/enrollments.service';
import { CsvImportService, CsvMapping } from './csv-import.service';
import { BulkLeadsDto, ListLeadsDto, UpdateLeadDto } from './dto/leads.dto';
import { LeadsService } from './leads.service';

@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly csvImport: CsvImportService,
    private readonly enrollments: EnrollmentsService,
  ) {}

  /** FR-3.6 — multipart CSV + column mapping (JSON in the `mapping` field). */
  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  import(@UploadedFile() file: Express.Multer.File | undefined, @Body('mapping') mapping?: string) {
    if (!file) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'file is required' });
    }
    let parsed: CsvMapping;
    try {
      parsed = JSON.parse(mapping ?? '');
    } catch {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'mapping must be a JSON object ({ company, website, email?, phone?, city?, category? })',
      });
    }
    return this.csvImport.import(file.buffer, parsed);
  }

  @Get()
  list(@Query() dto: ListLeadsDto) {
    return this.leads.list(dto);
  }

  /** FR-10.2 — CSV export with the same filters as the list. Audited. */
  @Get('export')
  async export(
    @CurrentUser() user: AuthUser,
    @Query() dto: ListLeadsDto,
    @Res() res: Response,
  ) {
    const csv = await this.leads.exportCsv(dto, user);
    res
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="leads.csv"')
      .send(csv);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.leads.get(id);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLeadDto) {
    return this.leads.update(id, dto);
  }

  @Post('bulk')
  bulk(@Body() dto: BulkLeadsDto) {
    if (dto.action === 'enroll') {
      if (!dto.campaignId) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'campaignId is required for the enroll action',
        });
      }
      return this.enrollments.enroll(dto.campaignId, { leadIds: dto.ids });
    }
    return this.leads.bulk(dto.ids, dto.action);
  }
}
