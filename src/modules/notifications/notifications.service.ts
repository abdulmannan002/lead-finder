import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationKind, Prisma } from '@prisma/client';
import { pageParams, paged, PageQueryDto } from '../../common/pagination';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TenantCreateData } from '../../common/prisma/tenant-scope';
import { IntegrationsService } from '../integrations/integrations.service';
import { TelegramClient } from './telegram.client';

export type NotificationType = 'reply' | 'account_error' | 'system';

/**
 * FR-8.4 — every alert lands in the in-app feed; Telegram is added on
 * top when the tenant configured a bot (FR-2.4). Telegram failures are
 * logged, never thrown: the triggering pipeline (reply detection etc.)
 * must not fail because an alert channel is down.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly telegram: TelegramClient,
  ) {}

  async notify(type: NotificationType, text: string, payload: Record<string, unknown> = {}) {
    const notification = await this.prisma.client.notification.create({
      data: {
        type,
        payload: { text, ...payload },
      } satisfies TenantCreateData<Prisma.NotificationUncheckedCreateInput> as unknown as Prisma.NotificationUncheckedCreateInput,
    });

    const telegram = await this.integrations.getKey(IntegrationKind.TELEGRAM);
    const chatId = telegram?.config?.chatId;
    if (telegram && typeof chatId === 'string') {
      await this.telegram.sendMessage(telegram.key, chatId, text);
    }
    return notification;
  }

  async list(dto: PageQueryDto & { unread?: boolean }) {
    const { page, limit, skip, take } = pageParams(dto);
    const where = dto.unread ? { readAt: null } : {};
    const [data, total, unread] = await Promise.all([
      this.prisma.client.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.client.notification.count({ where }),
      this.prisma.client.notification.count({ where: { readAt: null } }),
    ]);
    return { ...paged(data, total, page, limit), unread };
  }

  async markRead(id: string) {
    const notification = await this.prisma.client.notification.findUnique({ where: { id } });
    if (!notification) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Notification not found' });
    }
    return this.prisma.client.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }
}
