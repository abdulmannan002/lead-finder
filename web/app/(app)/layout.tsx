'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  IconAudit,
  IconCampaigns,
  IconDashboard,
  IconInboxLeads,
  IconLeads,
  IconLogout,
  IconMetrics,
  IconReplies,
  IconRequests,
  IconSettings,
  IconStore,
} from '@/components/icons';
import { TenantSwitcher } from '@/components/tenant-switcher';
import { ToastProvider } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { clearSession, getSession } from '@/lib/auth';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: IconDashboard },
  { section: 'Marketplace' },
  { href: '/marketplace', label: 'My listing', icon: IconStore },
  { href: '/market-leads', label: 'Lead feed', icon: IconInboxLeads },
  { href: '/requests', label: 'My requests', icon: IconRequests },
  { section: 'Outreach' },
  { href: '/leads', label: 'Leads', icon: IconLeads },
  { href: '/campaigns', label: 'Campaigns', icon: IconCampaigns },
  { href: '/replies', label: 'Replies', icon: IconReplies },
  { href: '/metrics', label: 'Metrics', icon: IconMetrics },
  { section: 'Workspace' },
  { href: '/audit', label: 'Audit', icon: IconAudit, minRole: 'ADMIN' as const },
  { href: '/settings', label: 'Settings', icon: IconSettings },
] as Array<{
  href?: string;
  label?: string;
  icon?: React.ComponentType<{ className?: string }>;
  minRole?: 'ADMIN';
  section?: string;
}>;

const RANK: Record<string, number> = { MEMBER: 1, ADMIN: 2, OWNER: 3 };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    if (!getSession()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    const load = () =>
      api<{ unread: number }>('/notifications?limit=1')
        .then((r) => setUnread(r.unread))
        .catch(() => {});
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  }, [router]);

  if (!ready) return null;
  const session = getSession();
  const role = session?.role ?? 'MEMBER';

  function logout() {
    clearSession();
    router.replace('/login');
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <aside className="sticky top-0 flex h-screen w-60 flex-col border-r bg-card">
          <div className="border-b p-3">
            <div className="mb-2 flex items-center gap-2 px-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
                S
              </span>
              <span className="text-[15px] font-semibold tracking-tight">SignX Reach</span>
            </div>
            <TenantSwitcher />
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
            {NAV.filter((item) => !item.minRole || RANK[role] >= RANK[item.minRole]).map(
              (item) => {
                if (item.section) {
                  return (
                    <div
                      key={item.section}
                      className="px-3 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 first:pt-1"
                    >
                      {item.section}
                    </div>
                  );
                }
                const active = pathname?.startsWith(item.href!);
                const Icon = item.icon!;
                return (
                  <Link
                    key={item.href}
                    href={item.href!}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors',
                      active
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground')} />
                    {item.label}
                    {item.href === '/dashboard' && unread > 0 && (
                      <span className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground">
                        {unread}
                      </span>
                    )}
                  </Link>
                );
              },
            )}
          </nav>

          <div className="border-t p-3">
            <div className="mb-2 flex items-center gap-2 px-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase text-muted-foreground">
                {session?.user.email.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{session?.user.email}</div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {role.toLowerCase()}
                </div>
              </div>
              <button
                title="Log out"
                onClick={logout}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <IconLogout className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-6xl p-8">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
