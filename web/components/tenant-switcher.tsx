'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { getSession, saveSession, StoredSession } from '@/lib/auth';

interface WorkspaceRow {
  tenantId: string;
  name: string;
  slug: string;
  role: string;
}

/** FR-1.6 — switch the active workspace; scoping follows the new token. */
export function TenantSwitcher() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) return;
    setCurrent(session.tenant.id);
    api<WorkspaceRow[]>('/me/tenants')
      .then(setWorkspaces)
      .catch(() => setWorkspaces([]));
  }, []);

  async function onSwitch(tenantId: string) {
    if (tenantId === current) return;
    setBusy(true);
    try {
      const session = await api<StoredSession>('/auth/switch-tenant', {
        method: 'POST',
        body: { tenantId },
      });
      saveSession(session);
      // Full reload so every view re-fetches under the new tenant.
      window.location.assign('/dashboard');
    } finally {
      setBusy(false);
    }
  }

  if (workspaces.length === 0) {
    return (
      <div className="truncate px-2 text-sm font-medium">
        {getSession()?.tenant.name ?? 'Workspace'}
      </div>
    );
  }

  return (
    <select
      className="w-full rounded-md border bg-transparent px-2 py-1.5 text-sm font-medium"
      value={current}
      disabled={busy}
      onChange={(e) => void onSwitch(e.target.value)}
    >
      {workspaces.map((w) => (
        <option key={w.tenantId} value={w.tenantId}>
          {w.name} ({w.role.toLowerCase()})
        </option>
      ))}
    </select>
  );
}
