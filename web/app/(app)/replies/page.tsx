'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

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

export default function RepliesPage() {
  const [replies, setReplies] = useState<ReplyRow[]>([]);
  const [unhandledOnly, setUnhandledOnly] = useState(true);

  const reload = useCallback(() => {
    api<{ data: ReplyRow[] }>(`/replies?limit=50${unhandledOnly ? '&unhandled=true' : ''}`)
      .then((r) => setReplies(r.data))
      .catch(() => {});
  }, [unhandledOnly]);

  useEffect(() => reload(), [reload]);

  async function triage(id: string, outcome: string) {
    const note = window.prompt('Note (optional):') ?? undefined;
    await api(`/replies/${id}`, {
      method: 'PATCH',
      body: { outcome, ...(note ? { note } : {}) },
    }).catch(() => {});
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="flex-1 text-2xl font-semibold tracking-tight">Replies</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={unhandledOnly}
            onChange={(e) => setUnhandledOnly(e.target.checked)}
          />
          unhandled only
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Answer replies in your real mailbox — this inbox tracks and triages them.
      </p>

      {replies.length === 0 && (
        <p className="text-sm text-muted-foreground">No replies here — go win some.</p>
      )}
      {replies.map((reply) => (
        <Card key={reply.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">{reply.lead.company}</CardTitle>
              <span className="text-xs text-muted-foreground">
                {reply.lead.email} · {reply.campaign.name} ·{' '}
                {new Date(reply.updatedAt).toLocaleString()}
              </span>
              {reply.replyOutcome && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                  {reply.replyOutcome.toLowerCase().replace('_', ' ')}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <blockquote className="whitespace-pre-wrap rounded-md border-l-4 border-primary/40 bg-muted/40 p-3 text-sm">
              {reply.replyText ?? '(no text captured)'}
            </blockquote>
            {!reply.replyHandledAt && (
              <div className="flex gap-2">
                {OUTCOMES.map((o) => (
                  <Button
                    key={o.value}
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => void triage(reply.id, o.value)}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
