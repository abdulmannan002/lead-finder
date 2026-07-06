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
