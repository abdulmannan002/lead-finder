import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { runWithContext } from '../src/common/context/request-context';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { createApp, FakeTelegram } from './app.factory';

describe('Notifications (e2e, FR-8.4/FR-2.4)', () => {
  let app: INestApplication;
  let server: any;
  let fakeTelegram: FakeTelegram;
  let service: NotificationsService;
  let token: string;
  let tokenB: string;
  let tenantId: string;

  beforeAll(async () => {
    ({ app, fakeTelegram } = await createApp());
    server = app.getHttpServer();
    service = app.get(NotificationsService);

    const a = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'a@notif.test', password: 'password123', tenantName: 'Notif A' })
      .expect(201);
    token = a.body.accessToken;
    tenantId = a.body.tenant.id;

    const b = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'b@notif.test', password: 'password123', tenantName: 'Notif B' })
      .expect(201);
    tokenB = b.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('without a Telegram integration the alert is in-app only', async () => {
    await runWithContext({ tenantId }, () =>
      service.notify('system', 'Hello from the platform'),
    );
    expect(fakeTelegram.sent).toHaveLength(0);

    const res = await request(server)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.unread).toBe(1);
    expect(res.body.data[0].payload.text).toBe('Hello from the platform');
  });

  it('with a Telegram integration the alert also hits the bot chat', async () => {
    await request(server)
      .put('/api/v1/integrations/TELEGRAM')
      .set('Authorization', `Bearer ${token}`)
      .send({ botToken: 'valid-bot-token', chatId: '4242' })
      .expect(200);

    await runWithContext({ tenantId }, () =>
      service.notify('reply', 'New reply from Acme Logistics', { leadId: 'x' }),
    );

    expect(fakeTelegram.sent).toHaveLength(1);
    expect(fakeTelegram.sent[0]).toMatchObject({
      botToken: 'valid-bot-token',
      chatId: '4242',
      text: 'New reply from Acme Logistics',
    });
  });

  it('mark-read updates the unread counter', async () => {
    const list = await request(server)
      .get('/api/v1/notifications?unread=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.unread).toBe(2);

    await request(server)
      .post(`/api/v1/notifications/${list.body.data[0].id}/read`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const after = await request(server)
      .get('/api/v1/notifications?unread=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.unread).toBe(1);
    expect(after.body.meta.total).toBe(1);
  });

  describe('isolation (T-1)', () => {
    it("B sees an empty feed and cannot read A's notifications", async () => {
      const list = await request(server)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(list.body.meta.total).toBe(0);

      const a = await request(server)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await request(server)
        .post(`/api/v1/notifications/${a.body.data[0].id}/read`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });
});
