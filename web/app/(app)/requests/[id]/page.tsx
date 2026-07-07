'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { IconChat, IconMapPin, IconPhone, IconVerified } from '@/components/icons';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';

interface Offer {
  id: string;
  pitch: string;
  createdAt: string;
  provider: {
    slug: string;
    displayName: string;
    category: string;
    city: string | null;
    phone: string | null;
    whatsapp: string | null;
    verified: boolean;
  } | null;
}

interface OffersView {
  request: {
    id: string;
    title: string;
    description: string;
    category: string;
    city: string | null;
    remoteOk: boolean;
    budget: string | null;
    status: string;
    createdAt: string;
  };
  offers: Offer[];
}

function OfferCard({ offer }: { offer: Offer }) {
  const p = offer.provider;
  const whatsappHref = p?.whatsapp ? `https://wa.me/${p.whatsapp.replace(/[^0-9]/g, '')}` : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {p ? (
              <>
                <Link
                  href={`/market/${p.slug}`}
                  target="_blank"
                  className="font-semibold hover:text-primary hover:underline"
                >
                  {p.displayName}
                </Link>
                {p.verified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                    <IconVerified className="h-3 w-3" /> verified
                  </span>
                )}
                <span className="text-xs capitalize text-muted-foreground">{p.category}</span>
                {p.city && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                    <IconMapPin className="h-3 w-3" /> {p.city}
                  </span>
                )}
              </>
            ) : (
              <span className="font-semibold text-muted-foreground">Listing removed</span>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {new Date(offer.createdAt).toLocaleString()}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <blockquote className="whitespace-pre-wrap rounded-lg border-l-4 border-primary/40 bg-muted/40 p-4 text-sm leading-relaxed">
          {offer.pitch}
        </blockquote>
        {p && (
          <div className="flex flex-wrap gap-2">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <IconChat className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
            {p.phone && (
              <a
                href={`tel:${p.phone.replace(/\s/g, '')}`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
              >
                <IconPhone className="h-3.5 w-3.5" /> {p.phone}
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RequestOffersPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [view, setView] = useState<OffersView | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    api<OffersView>(`/requests/${id}/responses`)
      .then(setView)
      .catch(() => {});
  }, [id]);

  useEffect(() => reload(), [reload]);

  async function close() {
    setBusy(true);
    try {
      await api(`/requests/${id}/close`, { method: 'POST' });
      toast('Request closed — no new offers will come in');
      reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Close failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!view) return null;
  const { request, offers } = view;

  return (
    <div className="space-y-6">
      <PageHeader
        title={request.title}
        description={`${request.category}${request.city ? ` · ${request.city}` : ''}${request.budget ? ` · ${request.budget}` : ''} · posted ${new Date(request.createdAt).toLocaleDateString()}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={request.status} />
            {request.status === 'OPEN' && (
              <Button variant="outline" disabled={busy} onClick={() => void close()}>
                Close request
              </Button>
            )}
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What you asked for</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {request.description}
          </p>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">
          Offers ({offers.length})
        </h2>
        {offers.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No offers yet — matched businesses were notified and usually respond within a day.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => (
              <OfferCard key={offer.id} offer={offer} />
            ))}
          </div>
        )}
      </div>

      <Link href="/requests" className="inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Back to my requests
      </Link>
    </div>
  );
}
