'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { IconMapPin } from '@/components/icons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';

interface MatchedLead {
  id: string;
  title: string;
  description: string;
  category: string;
  city: string | null;
  remoteOk: boolean;
  budget: string | null;
  createdAt: string;
  score: number;
  responded: boolean;
}

function LeadCard({ lead, onResponded }: { lead: MatchedLead; onResponded: () => void }) {
  const { toast } = useToast();
  const [pitch, setPitch] = useState('');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function respond() {
    setBusy(true);
    try {
      await api(`/requests/${lead.id}/respond`, { method: 'POST', body: { pitch: pitch.trim() } });
      toast('Offer sent — the buyer sees your profile and contact details');
      onResponded();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send the offer', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{lead.title}</CardTitle>
          <div className="flex items-center gap-2">
            {lead.responded && <Badge variant="success">responded</Badge>}
            <Badge variant="info">match {lead.score}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="capitalize">{lead.category}</span>
          {lead.city && (
            <span className="inline-flex items-center gap-0.5">
              <IconMapPin className="h-3 w-3" /> {lead.city}
              {!lead.remoteOk && ' (local only)'}
            </span>
          )}
          {lead.budget && <span>budget: {lead.budget}</span>}
          <span>{new Date(lead.createdAt).toLocaleDateString()}</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {lead.description}
        </p>

        {!lead.responded &&
          (open ? (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
              <textarea
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Your offer: what you'll deliver, rough price, timeline. One shot — make it count (at least 20 characters)."
                className="w-full rounded-md border bg-card px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              <div className="flex gap-2">
                <Button disabled={pitch.trim().length < 20 || busy} onClick={() => void respond()}>
                  {busy ? 'Sending…' : 'Send offer'}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setOpen(true)}>Respond with an offer</Button>
          ))}
      </CardContent>
    </Card>
  );
}

export default function MarketLeadsPage() {
  const [leads, setLeads] = useState<MatchedLead[]>([]);
  const [noProfile, setNoProfile] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    api<{ data: MatchedLead[] }>('/requests/matched?limit=50')
      .then((r) => {
        setLeads(r.data);
        setNoProfile(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'NO_PUBLISHED_PROFILE') setNoProfile(true);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => reload(), [reload]);

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lead feed"
        description="Open buyer requests matched to your profile — respond with an offer to win the work."
      />

      {noProfile ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Publish your business profile to start receiving matched leads.
            </p>
            <Link
              href="/marketplace"
              className="mt-4 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Set up my profile
            </Link>
          </CardContent>
        </Card>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No matching requests right now. You&apos;ll get a notification the moment a buyer posts
            one in your category.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onResponded={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
