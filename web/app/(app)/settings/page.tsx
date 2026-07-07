'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';

interface IntegrationView {
  kind: string;
  status: string;
  keyLast4: string;
  config: Record<string, unknown> | null;
}

const KINDS: { kind: string; label: string; hint: string }[] = [
  { kind: 'APIFY', label: 'Apify', hint: 'Google Maps scraping (personal API token)' },
  { kind: 'HUNTER', label: 'Hunter.io', hint: 'Email finding fallback (M2)' },
  { kind: 'ANTHROPIC', label: 'Anthropic', hint: 'AI openers (M2)' },
  { kind: 'TELEGRAM', label: 'Telegram', hint: 'Reply alerts (M4) — bot token + chat ID' },
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
  const [key, setKey] = useState('');
  const [chatId, setChatId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { key };
      if (kind === 'TELEGRAM') body.chatId = chatId;
      await api(`/integrations/${kind}`, { method: 'PUT', body });
      setKey('');
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api(`/integrations/${kind}`, { method: 'DELETE' });
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
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              connected ····{current.keyLast4}
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              not connected
            </span>
          )}
        </div>
        <CardDescription>{hint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${kind}-key`}>{kind === 'TELEGRAM' ? 'Bot token' : 'API key'}</Label>
          <Input
            id={`${kind}-key`}
            type="password"
            placeholder={current ? 'Replace the stored key…' : 'Paste the key…'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        {kind === 'TELEGRAM' && (
          <div className="space-y-1.5">
            <Label htmlFor="tg-chat">Chat ID</Label>
            <Input
              id="tg-chat"
              value={chatId}
              placeholder={(current?.config?.chatId as string) ?? ''}
              onChange={(e) => setChatId(e.target.value)}
            />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={() => void save()} disabled={busy || !key}>
            {busy ? 'Validating…' : 'Save & validate'}
          </Button>
          {current && (
            <Button variant="outline" onClick={() => void remove()} disabled={busy}>
              Remove
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface EmailAccountView {
  id: string;
  address: string;
  status: string;
  dailyCap: number;
  fromName: string | null;
}

function EmailAccountsCard() {
  const [accounts, setAccounts] = useState<EmailAccountView[]>([]);
  const [form, setForm] = useState({
    address: '',
    host: '',
    port: '587',
    user: '',
    pass: '',
    fromName: '',
    signature: '',
    dailyCap: '30',
  });
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api<EmailAccountView[]>('/email-accounts').then(setAccounts).catch(() => {});
  }, []);
  useEffect(() => reload(), [reload]);

  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await api('/email-accounts/smtp', {
        method: 'POST',
        body: {
          ...form,
          port: Number(form.port),
          dailyCap: Number(form.dailyCap) || 30,
          fromName: form.fromName || undefined,
          signature: form.signature || undefined,
        },
      });
      setForm((f) => ({ ...f, address: '', user: '', pass: '' }));
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to connect');
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(id: string) {
    setNotice(null);
    try {
      await api(`/email-accounts/${id}/test`, { method: 'POST' });
      setNotice('Test email sent — check the inbox (mailhog: http://localhost:8025).');
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : 'Test send failed');
    }
  }

  async function patchCap(id: string, dailyCap: number) {
    await api(`/email-accounts/${id}`, { method: 'PATCH', body: { dailyCap } }).catch(() => {});
    reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sending accounts (SMTP)</CardTitle>
        <CardDescription>
          The connection is tested before saving; credentials are encrypted and never shown again.
          Daily caps are enforced server-side.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {accounts.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm">
            <span className="font-medium">{a.address}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{a.status.toLowerCase()}</span>
            <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              cap/day
              <input
                className="w-16 rounded-md border bg-transparent px-1 py-0.5 text-xs"
                type="number"
                defaultValue={a.dailyCap}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v && v !== a.dailyCap) void patchCap(a.id, v);
                }}
              />
            </label>
            <Button variant="outline" className="h-7 px-2 text-xs" onClick={() => void sendTest(a.id)}>
              Send test
            </Button>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Input placeholder="From address" value={form.address} onChange={set('address')} />
          <Input placeholder="SMTP host" value={form.host} onChange={set('host')} />
          <Input placeholder="Port" type="number" value={form.port} onChange={set('port')} />
          <Input placeholder="Daily cap" type="number" value={form.dailyCap} onChange={set('dailyCap')} />
          <Input placeholder="Username" value={form.user} onChange={set('user')} />
          <Input placeholder="Password" type="password" value={form.pass} onChange={set('pass')} />
          <Input placeholder="From name (optional)" value={form.fromName} onChange={set('fromName')} />
          <Input placeholder="Signature (optional)" value={form.signature} onChange={set('signature')} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        <Button onClick={() => void connect()} disabled={busy || !form.address || !form.host}>
          {busy ? 'Testing connection…' : 'Connect account'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<IntegrationView[]>([]);

  const reload = useCallback(() => {
    api<IntegrationView[]>('/integrations').then(setIntegrations).catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Bring your own API keys — they are validated, encrypted, and never shown again.
        </p>
      </div>
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
    </div>
  );
}
