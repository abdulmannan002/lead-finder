import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailSource, Prisma } from '@prisma/client';
import { parse } from 'csv-parse/sync';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { normalizeDomain } from './normalize';

/** Column mapping: lead field → CSV header name. company + website required. */
export interface CsvMapping {
  company: string;
  website: string;
  email?: string;
  phone?: string;
  city?: string;
  category?: string;
}

const REQUIRED: (keyof CsvMapping)[] = ['company', 'website'];
const OPTIONAL: (keyof CsvMapping)[] = ['email', 'phone', 'city', 'category'];

@Injectable()
export class CsvImportService {
  constructor(private readonly prisma: PrismaService) {}

  /** FR-3.6 — same normalize + dedupe path as scraping. */
  async import(file: Buffer, mapping: CsvMapping) {
    for (const field of REQUIRED) {
      if (!mapping?.[field]) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: `mapping.${field} is required`,
        });
      }
    }

    let records: Record<string, string>[];
    try {
      records = parse(file, { columns: true, skip_empty_lines: true, trim: true, bom: true });
    } catch (err) {
      throw new BadRequestException({
        code: 'INVALID_CSV',
        message: `Could not parse CSV: ${(err as Error).message}`,
      });
    }
    if (records.length === 0) {
      throw new BadRequestException({ code: 'EMPTY_CSV', message: 'The CSV has no data rows' });
    }

    const headers = Object.keys(records[0]);
    for (const field of [...REQUIRED, ...OPTIONAL]) {
      const column = mapping[field];
      if (column && !headers.includes(column)) {
        throw new BadRequestException({
          code: 'UNKNOWN_COLUMN',
          message: `mapping.${field} refers to column "${column}" which is not in the CSV`,
          details: { headers },
        });
      }
    }

    const rows = records.map((rec) => {
      const rawEmail = mapping.email ? rec[mapping.email] : undefined;
      return {
        company: (rec[mapping.company] || 'Unknown').slice(0, 200),
        websiteDomain: normalizeDomain(rec[mapping.website]),
        email: rawEmail && rawEmail.includes('@') ? rawEmail : null,
        phone: mapping.phone ? rec[mapping.phone] || null : null,
        city: mapping.city ? rec[mapping.city] || null : null,
        category: mapping.category ? rec[mapping.category] || null : null,
      };
    });

    // FR-3.5 — M1 ships the discard path only (docs/02 §3 note).
    const usable = rows.filter((r) => r.websiteDomain !== null);
    const discarded = rows.length - usable.length;

    const { count: imported } = await this.prisma.client.lead.createMany({
      data: usable.map(
        (r) =>
          ({
            company: r.company,
            websiteDomain: r.websiteDomain as string,
            email: r.email,
            emailSource: r.email ? EmailSource.IMPORT : null,
            phone: r.phone,
            city: r.city,
            category: r.category,
          }) satisfies TenantCreateData<Prisma.LeadUncheckedCreateInput>,
      ) as Prisma.LeadUncheckedCreateInput[],
      skipDuplicates: true, // FR-3.4 — same dedupe as scraping
    });

    return {
      totalRows: records.length,
      imported,
      duplicates: usable.length - imported,
      discarded,
    };
  }
}
