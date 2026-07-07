'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { clearSession, getSession } from '@/lib/auth';

/* ------------------------------- Team ---------------------------------- */

interface MemberRow {
  membershipId: string;
  email: string;
  role: string;
  joinedAt: string;
}

function TeamCard() {
  const { toast } = useToast();
  const session = getSession();
  const isOwner = session?.role === 'OWNER';
  const isAdmin = session?.role === 'OWNER' || session?.role === 'ADMIN';
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api<MemberRow[]>('/tenant/users').then(setMembers).catch(() => {});
  }, []);
  useEffect(() => reload(), [reload]);

  async function invite() {
    setBusy(true);
    try {
      await api('/auth/invite', { method: 'POST', body: { email: inviteEmail, role: inviteRole } });
      toast(`Invitation sent to ${inviteEmail}`);
      setInviteEmail('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Invite failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(membershipId: string, role: string) {
    try {
      await api(`/tenant/users/${membershipId}`, { method: 'PATCH', body: { role } });
      toast('Role updated');
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Role change failed', 'error');
      reload();
    }
  }

  async function remove(member: MemberRow) {
    if (!window.confirm(`Remove ${member.email} from this workspace?`)) return;
    try {
      await api(`/tenant/users/${member.membershipId}`, { method: 'DELETE' });
      toast(`${member.email} removed`);
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Remove failed', 'error');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Team</CardTitle>
        <CardDescription>
          Members of this workspace. Roles apply per workspace — the same person can hold a
          different role elsewhere.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="divide-y rounded-lg border">
          {members.map((m) => (
            <div key={m.membershipId} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase text-muted-foreground">
                {m.email.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.email}</div>
                <div className="text-xs text-muted-foreground">
                  joined {new Date(m.joinedAt).toLocaleDateString()}
                </div>
              </div>
              {isOwner ? (
                <select
                  className="h-8 rounded-md border bg-transparent px-2 text-xs"
                  value={m.role}
                  onChange={(e) => void changeRole(m.membershipId, e.target.value)}
                >
                  {['OWNER', 'ADMIN', 'MEMBER'].map((r) => (
                    <option key={r} value={r}>
                      {r.toLowerCase()}
                    </option>
                  ))}
                </select>
              ) : (
                <Badge variant="outline">{m.role.toLowerCase()}</Badge>
              )}
              {isAdmin && members.length > 1 && (
                <Button variant="ghost" className="h-8 px-2 text-xs text-destructive" onClick={() => void remove(m)}>
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>

        {isAdmin && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="invite-email">Invite by email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@agency.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              <option value="MEMBER">member</option>
              <option value="ADMIN">admin</option>
            </select>
            <Button onClick={() => void invite()} disabled={busy || !inviteEmail}>
              {busy ? 'Sending…' : 'Send invite'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------- Sending accounts --------------------------- */

interface EmailAccountView {
  id: string;
  address: string;
  status: string;
  dailyCap: number;
  fromName: string | null;
}

function EmailAccountsCard() {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<EmailAccountView[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    address: '',
    host: '',
    port: '587',
    user: '',
    pass: '',
    fromName: '',
    signature: '',
    dailyCap: '30',
    imapHost: '',
  });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api<EmailAccountView[]>('/email-accounts').then(setAccounts).catch(() => {});
  }, []);
  useEffect(() => reload(), [reload]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function connect() {
    setBusy(true);
    try {
      await api('/email-accounts/smtp', {
        method: 'POST',
        body: {
          ...form,
          port: Number(form.port),
          dailyCap: Number(form.dailyCap) || 30,
          fromName: form.fromName || undefined,
          signature: form.signature || undefined,
          imapHost: form.imapHost || undefined,
        },
      });
      toast(`${form.address} connected`);
      setOpen(false);
      setForm((f) => ({ ...f, address: '', user: '', pass: '' }));
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Connection failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(account: EmailAccountView) {
    try {
      await api(`/email-accounts/${account.id}/test`, { method: 'POST' });
      toast(`Test email sent to ${account.address}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Test send failed', 'error');
    }
  }

  async function patchCap(id: string, dailyCap: number) {
    try {
      await api(`/email-accounts/${id}`, { method: 'PATCH', body: { dailyCap } });
      toast('Daily cap updated');
    } catch {
      toast('Cap update failed', 'error');
    }
    reload();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Sending accounts</CardTitle>
            <CardDescription>
              SMTP connections are verified before saving; credentials are encrypted and never
              shown again. Daily caps are enforced server-side.
            </CardDescription>
          </div>
          <Button variant="outline" onClick={() => setOpen((o) => !o)}>
            {open ? 'Cancel' : 'Connect account'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.length === 0 && !open && (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            No sending accounts yet — connect the mailbox your outreach goes out from.
          </p>
        )}
        {accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{a.address}</div>
              {a.fromName && <div className="text-xs text-muted-foreground">sends as “{a.fromName}”</div>}
            </div>
            <StatusBadge status={a.status} />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              cap/day
              <input
                className="w-16 rounded-md border bg-transparent px-1.5 py-1 text-xs"
                type="number"
                defaultValue={a.dailyCap}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v && v !== a.dailyCap) void patchCap(a.id, v);
                }}
              />
            </label>
            <Button variant="outline" className="h-8 px-2.5 text-xs" onClick={() => void sendTest(a)}>
              Send test
            </Button>
          </div>
        ))}

        {open && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
              <Input placeholder="From address" value={form.address} onChange={set('address')} />
              <Input placeholder="SMTP host" value={form.host} onChange={set('host')} />
              <Input placeholder="Port" type="number" value={form.port} onChange={set('port')} />
              <Input placeholder="Username" value={form.user} onChange={set('user')} />
              <Input placeholder="Password" type="password" value={form.pass} onChange={set('pass')} />
              <Input placeholder="Daily cap" type="number" value={form.dailyCap} onChange={set('dailyCap')} />
              <Input placeholder="From name (optional)" value={form.fromName} onChange={set('fromName')} />
              <Input placeholder="Signature (optional)" value={form.signature} onChange={set('signature')} />
              <Input placeholder="IMAP host (default: SMTP host)" value={form.imapHost} onChange={set('imapHost')} />
            </div>
            <Button onClick={() => void connect()} disabled={busy || !form.address || !form.host}>
              {busy ? 'Testing connection…' : 'Verify & connect'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Integrations ---------------------------- */

interface IntegrationView {
  kind: string;
  status: string;
  keyLast4: string;
  config: Record<string, unknown> | null;
}

const KINDS: { kind: string; label: string; hint: string }[] = [
  { kind: 'APIFY', label: 'Apify', hint: 'Google Maps scraping (personal API token)' },
  { kind: 'HUNTER', label: 'Hunter.io', hint: 'Email finding fallback' },
  { kind: 'ANTHROPIC', label: 'Anthropic', hint: 'AI-personalized openers' },
  { kind: 'TELEGRAM', label: 'Telegram', hint: 'Reply alerts — bot token + chat ID' },
];

function IntegrationCard({
  kind,
  label,
  hint,
  current,
  onSaved,
}: {
  kind: string;
  label: string;
  hint: string;
  current?: IntegrationView;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [key, setKey] = useState('');
  const [chatId, setChatId] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { key };
      if (kind === 'TELEGRAM') body.chatId = chatId;
      await api(`/integrations/${kind}`, { method: 'PUT', body });
      toast(`${label} key validated and saved`);
      setKey('');
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Validation failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/integrations/${kind}`, { method: 'DELETE' });
      toast(`${label} disconnected`);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          {current ? (
            <Badge variant="success">connected ····{current.keyLast4}</Badge>
          ) : (
            <Badge variant="outline">not connected</Badge>
          )}
        </div>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          type="password"
          placeholder={current ? 'Replace the stored key…' : 'Paste the API key…'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        {kind === 'TELEGRAM' && (
          <Input
            placeholder={`Chat ID${current?.config?.chatId ? ` (current: ${current.config.chatId})` : ''}`}
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
          />
        )}
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={busy || !key}>
            {busy ? 'Validating…' : 'Save & validate'}
          </Button>
          {current && (
            <Button variant="ghost" className="text-destructive" onClick={() => void remove()} disabled={busy}>
              Disconnect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Danger zone ----------------------------- */

function DangerZone() {
  const { toast } = useToast();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const session = getSession();
  if (session?.role !== 'OWNER') return null;

  async function destroy() {
    setBusy(true);
    try {
      await api('/tenant', { method: 'DELETE', body: { password } });
      clearSession();
      router.replace('/login');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Deletion failed', 'error');
      setBusy(false);
    }
  }

  return (
    <Card className="border-red-200">
      <CardHeader>
        <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
        <CardDescription>
          Deleting the workspace disables sending immediately, signs everyone out, and permanently
          purges all data after 30 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!confirming ? (
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            Delete workspace…
          </Button>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-64 space-y-1.5">
              <Label htmlFor="confirm-pass">Confirm with your password</Label>
              <Input
                id="confirm-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button variant="destructive" onClick={() => void destroy()} disabled={busy || !password}>
              {busy ? 'Deleting…' : `Permanently delete “${session?.tenant.name}”`}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- Page --------------------------------- */

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<IntegrationView[]>([]);

  const reload = useCallback(() => {
    api<IntegrationView[]>('/integrations').then(setIntegrations).catch(() => {});
  }, []);
  useEffect(() => reload(), [reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Workspace team, sending accounts and third-party keys — validated, encrypted, write-only."
      />
      <TeamCard />
      <EmailAccountsCard />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {KINDS.map(({ kind, label, hint }) => (
          <IntegrationCard
            key={kind}
            kind={kind}
            label={label}
            hint={hint}
            current={integrations.find((i) => i.kind === kind)}
            onSaved={reload}
          />
        ))}
      </div>
      <DangerZone />
    </div>
  );
}
