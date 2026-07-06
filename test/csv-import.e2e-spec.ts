import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from './app.factory';

describe('CSV import (e2e, FR-3.6)', () => {
  let app: INestApplication;
  let server: any;
  let token: string;

  const CSV = [
    'Company Name,Site,Mail,City',
    'Delta Logistics,https://www.delta-logistics.pk,info@delta-logistics.pk,Lahore',
    'Echo Movers,echo-movers.pk,,Karachi',
    'Echo Movers Again,http://echo-movers.pk/contact,,Karachi',
    'No Website Co,,boss@nowhere.pk,Multan',
  ].join('\n');

  const MAPPING = { company: 'Company Name', website: 'Site', email: 'Mail', city: 'City' };

  beforeAll(async () => {
    ({ app } = await createApp());
    server = app.getHttpServer();
    const session = await request(server)
      .post('/api/v1/auth/signup')
      .send({ email: 'owner@csv.test', password: 'password123', tenantName: 'CSV Co' })
      .expect(201);
    token = session.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function upload(csv: string, mapping: unknown) {
    return request(server)
      .post('/api/v1/leads/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), 'leads.csv')
      .field('mapping', JSON.stringify(mapping));
  }

  it('imports mapped columns through the same normalize + dedupe path', async () => {
    const res = await upload(CSV, MAPPING).expect(201);
    expect(res.body).toEqual({
      totalRows: 4,
      imported: 2, // delta + echo (the second echo row dedupes in-batch)
      duplicates: 1,
      discarded: 1, // no-website row (FR-3.5)
    });

    const leads = await request(server)
      .get('/api/v1/leads?q=echo')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(leads.body.meta.total).toBe(1);
    expect(leads.body.data[0].websiteDomain).toBe('echo-movers.pk');

    const imported = await request(server)
      .get('/api/v1/leads?q=delta')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(imported.body.data[0].emailSource).toBe('IMPORT');
  });

  it('re-importing the same file creates nothing new (T-2 semantics)', async () => {
    const res = await upload(CSV, MAPPING).expect(201);
    expect(res.body.imported).toBe(0);
    expect(res.body.duplicates).toBe(3);
  });

  it('names an unknown mapped column (422-style clear error)', async () => {
    const res = await upload(CSV, { ...MAPPING, website: 'Homepage' }).expect(400);
    expect(res.body.error.code).toBe('UNKNOWN_COLUMN');
    expect(res.body.error.message).toContain('Homepage');
  });

  it('rejects missing required mapping and empty files', async () => {
    await upload(CSV, { company: 'Company Name' }).expect(400);
    const empty = await upload('Company Name,Site\n', MAPPING).expect(400);
    expect(empty.body.error.code).toBe('EMPTY_CSV');
  });
});
