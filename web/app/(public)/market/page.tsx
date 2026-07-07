import Link from 'next/link';
import { IconMapPin, IconSearch, IconVerified } from '@/components/icons';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export const metadata = {
  title: 'SignX Market — find trusted businesses in Pakistan',
  description:
    'Search verified local businesses by category and city, or post what you need and let providers come to you with offers.',
};

interface PublicProfile {
  slug: string;
  displayName: string;
  category: string;
  services: string[];
  description: string | null;
  city: string | null;
  verified: boolean;
}

async function fetchDirectory(params: { q?: string; category?: string; city?: string }) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.category) qs.set('category', params.category);
  if (params.city) qs.set('city', params.city);
  qs.set('limit', '24');
  try {
    const res = await fetch(`${BASE}/public/directory?${qs}`, { cache: 'no-store' });
    if (!res.ok) return { data: [] as PublicProfile[], total: 0 };
    const body = await res.json();
    return { data: body.data as PublicProfile[], total: body.meta.total as number };
  } catch {
    return { data: [] as PublicProfile[], total: 0 };
  }
}

function BusinessCard({ biz }: { biz: PublicProfile }) {
  return (
    <Link
      href={`/market/${biz.slug}`}
      className="group flex flex-col gap-2 rounded-lg border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold leading-tight tracking-tight group-hover:text-primary">
          {biz.displayName}
        </h3>
        {biz.verified && (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
            <IconVerified className="h-3 w-3" /> verified
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="capitalize">{biz.category}</span>
        {biz.city && (
          <span className="inline-flex items-center gap-0.5">
            <IconMapPin className="h-3 w-3" /> {biz.city}
          </span>
        )}
      </div>
      {biz.description && (
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {biz.description}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-1 pt-1">
        {biz.services.slice(0, 4).map((s) => (
          <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize text-muted-foreground">
            {s}
          </span>
        ))}
      </div>
    </Link>
  );
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; city?: string }>;
}) {
  const params = await searchParams;
  const { data, total } = await fetchDirectory(params);
  const searching = Boolean(params.q || params.category || params.city);

  return (
    <div>
      <section className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center">
          <h1 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Find trusted businesses — or let them find you
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            Every listing is a real, registered business. Search the directory, or post what you
            need and compare offers from matching providers.
          </p>

          <form action="/market" className="mx-auto mt-8 flex max-w-2xl flex-wrap gap-2">
            <div className="relative min-w-52 flex-1">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="What are you looking for? e.g. POS software"
                className="h-11 w-full rounded-md border bg-card pl-9 pr-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>
            <input
              name="city"
              defaultValue={params.city ?? ''}
              placeholder="City"
              className="h-11 w-36 rounded-md border bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            <button className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
              Search
            </button>
          </form>

          <p className="mt-4 text-xs text-muted-foreground">
            Can&apos;t find it?{' '}
            <Link href="/requests" className="font-medium text-primary hover:underline">
              Post a request
            </Link>{' '}
            and matching businesses will send you offers.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {searching ? `Results (${total})` : 'Recently listed'}
          </h2>
        </div>

        {data.length === 0 ? (
          <div className="rounded-lg border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {searching
                ? 'No businesses match that search yet.'
                : 'The directory is just opening — be the first to list.'}
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Link
                href="/requests"
                className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
              >
                Post a request instead
              </Link>
              <Link
                href="/signup"
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                List your business — free
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((biz) => (
              <BusinessCard key={biz.slug} biz={biz} />
            ))}
          </div>
        )}
      </section>

      <section className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:grid-cols-3">
          {[
            {
              title: '1. Post what you need',
              body: 'Describe the job — category, city, budget. Takes two minutes.',
            },
            {
              title: '2. Providers are notified',
              body: 'Registered businesses matching your request get alerted instantly.',
            },
            {
              title: '3. Compare real offers',
              body: 'Pick the best pitch and contact them directly by phone or WhatsApp.',
            },
          ].map((step) => (
            <div key={step.title} className="rounded-lg border bg-card p-5">
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
