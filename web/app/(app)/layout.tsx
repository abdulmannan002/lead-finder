'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { Button } from '@/components/ui/button';
import { clearSession, getSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/leads', label: 'Leads' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/replies', label: 'Replies' },
  { href: '/metrics', label: 'Metrics' },
  { href: '/settings', label: 'Settings' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  if (!ready) return null;

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 flex-col border-r bg-muted/30">
        <div className="border-b p-3">
          <div className="mb-2 px-2 text-lg font-semibold tracking-tight">SignX Reach</div>
          <TenantSwitcher />
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
                pathname?.startsWith(item.href) && 'bg-muted text-primary',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="mb-2 truncate px-1 text-xs text-muted-foreground">
            {getSession()?.user.email}
          </div>
          <Button variant="outline" className="w-full" onClick={logout}>
            Log out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
