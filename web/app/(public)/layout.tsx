import Link from 'next/link';
import { MarketAuthButtons } from '@/components/market-auth-buttons';

/** Public marketplace chrome (MP-2) — no auth, SEO-friendly. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/market" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              S
            </span>
            <span className="text-[15px] font-semibold tracking-tight">SignX Market</span>
          </Link>
          <MarketAuthButtons />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-muted-foreground">
          <span>SignX Market — real businesses, real requests. Every listing is a registered account.</span>
          <span>
            <Link href="/signup" className="hover:text-foreground">
              List your business
            </Link>
            {' · '}
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
