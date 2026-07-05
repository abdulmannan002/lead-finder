import {
  applyTenantScope,
  ScopedClientViolationError,
  TENANT_SCOPED_MODELS,
  TenantContextError,
  TenantMismatchError,
} from './tenant-scope';

const CTX = { userId: 'u1', tenantId: 't1', role: 'OWNER' as const };

describe('TENANT_SCOPED_MODELS (derived from schema)', () => {
  it('contains every model with a tenantId field, including denormalized children', () => {
    for (const m of [
      'Membership',
      'Invitation',
      'RefreshToken',
      'EmailAccount',
      'Integration',
      'ScrapeQuery',
      'ScrapeRun',
      'Lead',
      'Campaign',
      'SequenceStep',
      'Enrollment',
      'Message',
      'DailyMetric',
      'ActivityLog',
    ]) {
      expect(TENANT_SCOPED_MODELS.has(m)).toBe(true);
    }
  });

  it('does not contain the global/special models', () => {
    expect(TENANT_SCOPED_MODELS.has('User')).toBe(false);
    expect(TENANT_SCOPED_MODELS.has('Tenant')).toBe(false);
  });
});

describe('applyTenantScope — fail closed', () => {
  it('throws without a context', () => {
    expect(() => applyTenantScope('Lead', 'findMany', {}, undefined)).toThrow(TenantContextError);
  });

  it('throws with a context that has no tenantId', () => {
    expect(() => applyTenantScope('Lead', 'findMany', {}, {})).toThrow(TenantContextError);
  });

  it('throws for Tenant without a context', () => {
    expect(() => applyTenantScope('Tenant', 'findFirst', {}, undefined)).toThrow(TenantContextError);
  });
});

describe('applyTenantScope — reads', () => {
  it('injects tenantId into findMany where', () => {
    const out = applyTenantScope('Lead', 'findMany', { where: { status: 'NEW' } }, CTX);
    expect(out.where).toEqual({ status: 'NEW', tenantId: 't1' });
  });

  it('injects tenantId when args are undefined', () => {
    const out = applyTenantScope('Lead', 'findMany', undefined, CTX);
    expect(out.where).toEqual({ tenantId: 't1' });
  });

  it('injects tenantId into findUnique (extended where-unique)', () => {
    const out = applyTenantScope('Lead', 'findUnique', { where: { id: 'x' } }, CTX);
    expect(out.where).toEqual({ id: 'x', tenantId: 't1' });
  });

  it('overrides a caller-supplied foreign tenantId in where', () => {
    const out = applyTenantScope('Lead', 'findMany', { where: { tenantId: 'attacker' } }, CTX);
    expect(out.where.tenantId).toBe('t1');
  });

  it('does not mutate the original args', () => {
    const args = { where: { status: 'NEW' } };
    applyTenantScope('Lead', 'findMany', args, CTX);
    expect(args.where).toEqual({ status: 'NEW' });
  });
});

describe('applyTenantScope — writes', () => {
  it('stamps tenantId on create', () => {
    const out = applyTenantScope('Lead', 'create', { data: { company: 'Acme', websiteDomain: 'acme.com' } }, CTX);
    expect(out.data.tenantId).toBe('t1');
  });

  it('rejects a foreign tenantId on create', () => {
    expect(() =>
      applyTenantScope('Lead', 'create', { data: { company: 'Acme', tenantId: 't2' } }, CTX),
    ).toThrow(TenantMismatchError);
  });

  it('accepts a matching explicit tenantId on create', () => {
    const out = applyTenantScope('Lead', 'create', { data: { company: 'Acme', tenantId: 't1' } }, CTX);
    expect(out.data.tenantId).toBe('t1');
  });

  it('rejects relation-style tenant assignment on create', () => {
    expect(() =>
      applyTenantScope('Lead', 'create', { data: { company: 'Acme', tenant: { connect: { id: 't2' } } } }, CTX),
    ).toThrow(TenantMismatchError);
  });

  it('stamps every row of createMany', () => {
    const out = applyTenantScope(
      'Lead',
      'createMany',
      { data: [{ company: 'A' }, { company: 'B' }] },
      CTX,
    );
    expect(out.data.map((d: any) => d.tenantId)).toEqual(['t1', 't1']);
  });

  it('scopes update by tenantId and rejects foreign tenantId in data', () => {
    const out = applyTenantScope('Lead', 'update', { where: { id: 'x' }, data: { notes: 'hi' } }, CTX);
    expect(out.where).toEqual({ id: 'x', tenantId: 't1' });
    expect(() =>
      applyTenantScope('Lead', 'update', { where: { id: 'x' }, data: { tenantId: 't2' } }, CTX),
    ).toThrow(TenantMismatchError);
  });

  it('scopes delete/deleteMany', () => {
    expect(applyTenantScope('Lead', 'delete', { where: { id: 'x' } }, CTX).where.tenantId).toBe('t1');
    expect(applyTenantScope('Lead', 'deleteMany', { where: {} }, CTX).where.tenantId).toBe('t1');
  });

  it('scopes upsert where and stamps its create branch', () => {
    const out = applyTenantScope(
      'Lead',
      'upsert',
      { where: { id: 'x' }, create: { company: 'A' }, update: { notes: 'n' } },
      CTX,
    );
    expect(out.where.tenantId).toBe('t1');
    expect(out.create.tenantId).toBe('t1');
  });
});

describe('applyTenantScope — special models', () => {
  it('refuses User at the top level', () => {
    expect(() => applyTenantScope('User', 'findMany', {}, CTX)).toThrow(ScopedClientViolationError);
  });

  it('scopes Tenant reads/updates to the active tenant id', () => {
    const out = applyTenantScope('Tenant', 'findFirst', {}, CTX);
    expect(out.where).toEqual({ id: 't1' });
    const upd = applyTenantScope('Tenant', 'update', { where: {}, data: { name: 'X' } }, CTX);
    expect(upd.where).toEqual({ id: 't1' });
  });

  it('refuses Tenant lifecycle operations on the scoped client', () => {
    for (const op of ['create', 'delete', 'deleteMany', 'upsert']) {
      expect(() => applyTenantScope('Tenant', op, {}, CTX)).toThrow(ScopedClientViolationError);
    }
  });
});
