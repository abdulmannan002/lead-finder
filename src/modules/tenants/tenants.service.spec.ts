import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';

const OWNER = { userId: 'u1', tenantId: 't1', role: 'OWNER' as const };
const ADMIN = { userId: 'u2', tenantId: 't1', role: 'ADMIN' as const };

describe('TenantsService', () => {
  let client: any;
  let service: TenantsService;

  beforeEach(() => {
    client = {
      tenant: { findFirst: jest.fn(), update: jest.fn() },
      membership: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new TenantsService({ client } as any);
  });

  it('404s when the membership does not exist (or belongs to another tenant)', async () => {
    client.membership.findUnique.mockResolvedValue(null);
    await expect(service.changeRole('m-x', 'ADMIN')).rejects.toThrow(NotFoundException);
    await expect(service.removeMember(OWNER, 'm-x')).rejects.toThrow(NotFoundException);
  });

  it('refuses to demote the last owner', async () => {
    client.membership.findUnique.mockResolvedValue({ id: 'm1', role: 'OWNER' });
    client.membership.count.mockResolvedValue(1);
    await expect(service.changeRole('m1', 'MEMBER')).rejects.toThrow(BadRequestException);
  });

  it('allows demoting an owner when another owner remains', async () => {
    client.membership.findUnique.mockResolvedValue({ id: 'm1', role: 'OWNER' });
    client.membership.count.mockResolvedValue(2);
    client.membership.update.mockResolvedValue({ id: 'm1', role: 'ADMIN' });
    await expect(service.changeRole('m1', 'ADMIN')).resolves.toEqual({
      membershipId: 'm1',
      role: 'ADMIN',
    });
  });

  it('only an Owner may remove an Owner', async () => {
    client.membership.findUnique.mockResolvedValue({ id: 'm1', role: 'OWNER' });
    await expect(service.removeMember(ADMIN, 'm1')).rejects.toThrow(ForbiddenException);
  });

  it('refuses to remove the last owner', async () => {
    client.membership.findUnique.mockResolvedValue({ id: 'm1', role: 'OWNER' });
    client.membership.count.mockResolvedValue(1);
    await expect(service.removeMember(OWNER, 'm1')).rejects.toThrow(BadRequestException);
  });

  it('removes a regular member', async () => {
    client.membership.findUnique.mockResolvedValue({ id: 'm2', role: 'MEMBER' });
    client.membership.delete.mockResolvedValue({});
    await expect(service.removeMember(ADMIN, 'm2')).resolves.toEqual({ removed: true });
  });
});
