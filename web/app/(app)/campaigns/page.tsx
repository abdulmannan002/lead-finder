'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

interface StepRow {
  subjectTpl: string;
  bodyTpl: string;
  delayDays: number;
  threaded?: boolean;
}

interface CampaignRow {
  id: string;
  name: string;
  status: string;
  offerText: string | null;
  emailAccountId: string | null;
  steps: (StepRow & { stepOrder: number })[];
  emailAccount: { id: string; address: string } | null;
  _count: { enrollments: number };
}

interface AccountRow {
  id: string;
  address: string;
}

const EMPTY_STEP: StepRow = { subjectTpl: '', bodyTpl: '', delayDays: 2, threaded: true };

function CampaignCard({
  campaign,
  accounts,
  onChanged,
}: {
  campaign: CampaignRow;
  accounts: AccountRow[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<StepRow[]>(
    campaign.steps.length > 0
      ? campaign.steps.map((s) => ({ ...s }))
      : [{ ...EMPTY_STEP, delayDays: 0 }],
  );
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);

  const canEditSteps = campaign.status !== 'ACTIVE';

  async function call(fn: () => Promise<unknown>, okMessage?: string) {
    setMessage(null);
    try {
      await fn();
      if (okMessage) setMessage(okMessage);
      onChanged();
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Something went wrong');
    }
  }

  const saveSteps = () =>
    call(
      () => api(`/campaigns/${campaign.id}/steps`, { method: 'PUT', body: { steps } }),
      'Sequence saved.',
    );
  const setStatus = (status: string) =>
    call(() => api(`/campaigns/${campaign.id}`, { method: 'PATCH', body: { status } }));
  const setAccount = (emailAccountId: string) =>
    call(() => api(`/campaigns/${campaign.id}`, { method: 'PATCH', body: { emailAccountId } }));
  const testSend = () =>
    call(
      () => api(`/campaigns/${campaign.id}/test-send`, { method: 'POST' }),
      'Test email sent to the sending account.',
    );
  const enrollReady = () =>
    call(async () => {
      const res = await api<{ enrolled: number; skipped: unknown[] }>(
        `/campaigns/${campaign.id}/enroll`,
        { method: 'POST', body: { filter: { status: 'READY' } } },
      );
      setMessage(`Enrolled ${res.enrolled}, skipped ${res.skipped.length}.`);
    });
  const loadStats = () =>
    call(async () => setStats(await api(`/campaigns/${campaign.id}/stats`)));

  function setStep(index: number, patch: Partial<StepRow>) {
    setSteps((all) => all.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((o) => !o)}>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">{campaign.name}</CardTitle>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{campaign.status.toLowerCase()}</span>
          <span className="text-xs text-muted-foreground">
            {campaign.steps.length} steps · {campaign._count.enrollments} enrolled ·{' '}
            {campaign.emailAccount?.address ?? 'no sending account'}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">{open ? '▲' : '▼'}</span>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-8 rounded-md border bg-transparent px-2 text-sm"
              value={campaign.emailAccountId ?? ''}
              onChange={(e) => e.target.value && void setAccount(e.target.value)}
            >
              <option value="">Sending account…</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.address}
                </option>
              ))}
            </select>
            {campaign.status !== 'ACTIVE' ? (
              <Button className="h-8 text-xs" onClick={() => void setStatus('ACTIVE')}>
                Activate
              </Button>
            ) : (
              <Button variant="outline" className="h-8 text-xs" onClick={() => void setStatus('PAUSED')}>
                Pause
              </Button>
            )}
            <Button variant="outline" className="h-8 text-xs" onClick={() => void testSend()}>
              Test send
            </Button>
            <Button variant="outline" className="h-8 text-xs" onClick={() => void enrollReady()}>
              Enroll READY leads
            </Button>
            <Button variant="ghost" className="h-8 text-xs" onClick={() => void loadStats()}>
              Stats
            </Button>
          </div>

          {stats && (
            <div className="rounded-md border p-3 text-sm">
              <div className="mb-1 text-muted-foreground">
                sent {stats.totals.sent} · replied {stats.totals.REPLIED ?? 0} · reply rate{' '}
                {(stats.totals.replyRate * 100).toFixed(1)}%
              </div>
              {stats.steps.map((s: any) => (
                <div key={s.stepOrder}>
                  step {s.stepOrder}: {s.sent} sent, {s.replies} replies
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={i} className="space-y-1 rounded-md border p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Step {i + 1}</span>
                  {i > 0 && (
                    <label className="flex items-center gap-1">
                      after
                      <input
                        className="w-12 rounded-md border bg-transparent px-1 text-xs"
                        type="number"
                        min={0}
                        value={step.delayDays}
                        disabled={!canEditSteps}
                        onChange={(e) => setStep(i, { delayDays: Number(e.target.value) })}
                      />
                      days
                    </label>
                  )}
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={step.threaded ?? true}
                      disabled={!canEditSteps}
                      onChange={(e) => setStep(i, { threaded: e.target.checked })}
                    />
                    thread as reply
                  </label>
                  {steps.length > 1 && canEditSteps && (
                    <button
                      className="ml-auto text-destructive"
                      onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}
                    >
                      remove
                    </button>
                  )}
                </div>
                <Input
                  placeholder="Subject — e.g. Quick question, {{company}}"
                  value={step.subjectTpl}
                  disabled={!canEditSteps}
                  onChange={(e) => setStep(i, { subjectTpl: e.target.value })}
                />
                <textarea
                  className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                  placeholder={'Body — variables: {{company}} {{first_line}} {{city}} {{offer_price}} {{signature}}'}
                  value={step.bodyTpl}
                  disabled={!canEditSteps}
                  onChange={(e) => setStep(i, { bodyTpl: e.target.value })}
                />
              </div>
            ))}
            {canEditSteps && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setSteps((all) => [...all, { ...EMPTY_STEP }])}
                >
                  Add step
                </Button>
                <Button className="h-8 text-xs" onClick={() => void saveSteps()}>
                  Save sequence
                </Button>
              </div>
            )}
            {!canEditSteps && (
              <p className="text-xs text-muted-foreground">Pause the campaign to edit steps.</p>
            )}
          </div>

          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </CardContent>
      )}
    </Card>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [name, setName] = useState('');
  const [offer, setOffer] = useState('');

  const reload = useCallback(() => {
    api<{ data: CampaignRow[] }>('/campaigns?limit=50')
      .then((r) => setCampaigns(r.data))
      .catch(() => {});
    api<AccountRow[]>('/email-accounts').then(setAccounts).catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);

  async function create() {
    await api('/campaigns', {
      method: 'POST',
      body: { name, offerText: offer || undefined },
    }).catch(() => {});
    setName('');
    setOffer('');
    reload();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">New campaign</CardTitle>
          <CardDescription>Build the sequence, connect an account, then activate.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input className="w-64" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            className="w-48"
            placeholder="Offer price (e.g. PKR 50k/mo)"
            value={offer}
            onChange={(e) => setOffer(e.target.value)}
          />
          <Button onClick={() => void create()} disabled={!name}>
            Create
          </Button>
        </CardContent>
      </Card>

      {campaigns.map((c) => (
        <CampaignCard key={c.id} campaign={c} accounts={accounts} onChanged={reload} />
      ))}
      {campaigns.length === 0 && (
        <p className="text-sm text-muted-foreground">No campaigns yet.</p>
      )}
    </div>
  );
}
