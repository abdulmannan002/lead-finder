import {
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { AuthUser, CurrentUser } from '../../common/guards/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { JobQueue } from '../../common/queues/job-queue';
import { ENRICH_EMAIL_QUEUE } from '../../common/queues/queues.module';

@Controller('leads')
export class EnrichmentController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENRICH_EMAIL_QUEUE) private readonly enrichQueue: JobQueue,
  ) {}

  /** docs/04 — re-run the email finder for one lead. */
  @HttpCode(202)
  @Post(':id/enrich')
  async enrich(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const lead = await this.prisma.client.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lead not found' });
    // No jobId: manual re-runs must always enqueue (the processor is
    // idempotent), unlike batch jobs which dedupe on enrich:<leadId>.
    await this.enrichQueue.add('enrich', { tenantId: user.tenantId, leadId: id });
    return { queued: true };
  }
}
