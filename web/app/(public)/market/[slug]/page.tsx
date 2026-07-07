import { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IconChat, IconGlobe, IconMapPin, IconPhone, IconVerified } from '@/components/icons';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

interface PublicProfile {
  slug: string;
  displayName: string;
  category: string;
  services: string[];
  description: string | null;
  city: string | null;
  country: string;
  phone: string | null;
  whatsapp: string | null;
  websiteUrl: string | null;
  createdAt: string;
  verified: boolean;
}

async function fetchProfile(slug: string): Promise<PublicProfile | null> {
  try {
    const res = await fetch(`${BASE}/public/businesses/${slug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as PublicProfile;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const biz = await fetchProfile(slug);
  if (!biz) return { title: 'Business not found — SignX Market' };
  return {
    title: `${biz.displayName} — ${biz.category}${biz.city ? ` in ${biz.city}` : ''} | SignX Market`,
    description:
      biz.description ??
      `${biz.displayName} offers ${biz.services.slice(0, 3).join(', ')}${biz.city ? ` in ${biz.city}` : ''}.`,
  };
}

export default async function BusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const biz = await fetchProfile(slug);
  if (!biz) notFound();

  const whatsappHref = biz.whatsapp ? `https://wa.me/${biz.whatsapp.replace(/[^0-9]/g, '')}` : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <nav className="mb-6 text-xs text-muted-foreground">
        <Link href="/market" className="hover:text-foreground">
          Directory
        </Link>{' '}
        / <span className="capitalize">{biz.category}</span>
      </nav>

      <div className="rounded-lg border bg-card p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {biz.displayName}
              {biz.verified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                  <IconVerified className="h-3 w-3" /> verified
                </span>
              )}
            </h1>
            <div className="mt-1.5 flex items-center gap-3 text-sm text-muted-foreground">
              <span className="capitalize">{biz.category}</span>
              {biz.city && (
                <span className="inline-flex items-center gap-1">
                  <IconMapPin className="h-3.5 w-3.5" />
                  {biz.city}, {biz.country}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                <IconChat className="h-4 w-4" /> WhatsApp
              </a>
            )}
            {biz.phone && (
              <a
                href={`tel:${biz.phone.replace(/\s/g, '')}`}
                className="inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
              >
                <IconPhone className="h-4 w-4" /> {biz.phone}
              </a>
            )}
          </div>
        </div>

        {biz.description && (
          <p className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {biz.description}
          </p>
        )}

        <div className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Services
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {biz.services.map((s) => (
              <span key={s} className="rounded-full bg-muted px-2.5 py-1 text-xs capitalize text-muted-foreground">
                {s}
              </span>
            ))}
          </div>
        </div>

        {biz.websiteUrl && (
          <a
            href={biz.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <IconGlobe className="h-4 w-4" /> {biz.websiteUrl.replace(/^https?:\/\//, '')}
          </a>
        )}
      </div>

      <div className="mt-6 rounded-lg border border-dashed bg-muted/30 p-5 text-center text-sm text-muted-foreground">
        Need something like this done?{' '}
        <Link href="/requests" className="font-medium text-primary hover:underline">
          Post a request
        </Link>{' '}
        and compare offers from businesses like {biz.displayName}.
      </div>
    </div>
  );
}
