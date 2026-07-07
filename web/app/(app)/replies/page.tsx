'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';

interface ReplyRow {
  id: string;
  replyText: string | null;
  replyOutcome: string | null;
  replyHandledAt: string | null;
  updatedAt: string;
  lead: { company: string; email: string | null; websiteDomain: string; city: string | null };
  campaign: { name: string };
}

const OUTCOMES = [
  { value: 'CALL_BOOKED', label: 'Call booked' },
  { value: 'WON', label: 'Won' },
  { value: 'LOST', label: 'Lost' },
];

function ReplyCard({ reply, onChanged }: { reply: ReplyRow; onChanged: () => void }) {
  const { toast } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function triage(outcome: string) {
    setBusy(true);
    try {
      await api(`/replies/${reply.id}`, {
        method: 'PATCH',
        body: { outcome, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast(`${reply.lead.company} marked ${outcome.toLowerCase().replace('_', ' ')}`);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Triage failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{reply.lead.company}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {reply.lead.email} · {reply.campaign.name} ·{' '}
            {new Date(reply.updatedAt).toLocaleString()}
          </span>
          {reply.replyOutcome && <StatusBadge status={reply.replyOutcome} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <blockquote className="whitespace-pre-wrap rounded-lg border-l-4 border-primary/40 bg-muted/40 p-4 text-sm leading-relaxed">
          {reply.replyText ?? '(no text captured)'}
        </blockquote>
        {!reply.replyHandledAt && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              className="min-w-64 flex-1"
              placeholder="Optional note — lands on the lead record…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {OUTCOMES.map((o) => (
              <Button
                key={o.value}
                variant={o.value === 'WON' ? 'default' : 'outline'}
                className="h-9 text-xs"
                disabled={busy}
                onClick={() => void triage(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RepliesPage() {
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [unhandledOnly, setUnhandledOnly] = useState(true);

  const reload = useCallback(() => {
    api<{ data: ReplyRow[] }>(`/replies?limit=50${unhandledOnly ? '&unhandled=true' : ''}`)
      .then((r) => setReplies(r.data))
      .catch(() => {});
  }, [unhandledOnly]);

  useEffect(() => reload(), [reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Replies"
        description="Answer in your real mailbox — triage outcomes here so the funnel stays honest."
        actions={
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={unhandledOnly}
              onChange={(e) => setUnhandledOnly(e.target.checked)}
            />
            unhandled only
          </label>
        }
      />

      {replies.length === 0 && (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            {unhandledOnly
              ? 'Inbox zero — every reply is triaged.'
              : 'No replies yet. They land here the moment the watcher spots one.'}
          </CardContent>
        </Card>
      )}
      {replies.map((reply) => (
        <ReplyCard key={reply.id} reply={reply} onChanged={reload} />
      ))}
    </div>
  );
}
