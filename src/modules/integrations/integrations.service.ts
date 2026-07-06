import { Injectable, NotFoundException } from '@nestjs/common';
import { Integration, IntegrationKind, Prisma } from '@prisma/client';
import { SecretsService } from '../../common/crypto/secrets.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { KeyValidators } from './key-validators';

export interface IntegrationView {
  kind: IntegrationKind;
  status: string;
  /** Write-only secret: only the last 4 chars ever leave the API (docs/02 §5). */
  keyLast4: string;
  config: Record<string, unknown> | null;
  updatedAt: Date;
}

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: SecretsService,
    private readonly validators: KeyValidators,
  ) {}

  async put(kind: IntegrationKind, key: string, config?: Record<string, unknown>) {
    await this.validators.validate(kind, key, config);

    const enc = this.secrets.encrypt(key);
    const data = {
      keyEnc: enc.ciphertext,
      keyVersion: enc.keyVersion,
      config: (config ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      status: 'ACTIVE' as const,
    };

    const existing = await this.prisma.client.integration.findFirst({ where: { kind } });
    const saved = existing
      ? await this.prisma.client.integration.update({ where: { id: existing.id }, data })
      : await this.prisma.client.integration.create({
          data: { kind, ...data } satisfies TenantCreateData<Prisma.IntegrationUncheckedCreateInput> as Prisma.IntegrationUncheckedCreateInput,
        });
    return this.view(saved);
  }

  async list(): Promise<IntegrationView[]> {
    const rows = await this.prisma.client.integration.findMany({ orderBy: { kind: 'asc' } });
    return rows.map((r) => this.view(r));
  }

  async remove(kind: IntegrationKind) {
    const { count } = await this.prisma.client.integration.deleteMany({ where: { kind } });
    if (count === 0) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: `No ${kind} integration` });
    }
    return { removed: true };
  }

  /** For other modules (sourcing, enrichment…): the decrypted key, or null. */
  async getKey(kind: IntegrationKind): Promise<{ key: string; config: Record<string, unknown> | null } | null> {
    const row = await this.prisma.client.integration.findFirst({ where: { kind, status: 'ACTIVE' } });
    if (!row) return null;
    return {
      key: this.secrets.decrypt(row.keyEnc, row.keyVersion),
      config: (row.config as Record<string, unknown> | null) ?? null,
    };
  }

  private view(row: Integration): IntegrationView {
    return {
      kind: row.kind,
      status: row.status,
      keyLast4: this.secrets.last4(this.secrets.decrypt(row.keyEnc, row.keyVersion)),
      config: (row.config as Record<string, unknown> | null) ?? null,
      updatedAt: row.updatedAt,
    };
  }
}
