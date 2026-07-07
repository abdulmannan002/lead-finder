'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getSession } from '@/lib/auth';

/** Session-aware CTAs for the public marketplace chrome. */
export function MarketAuthButtons() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => setSignedIn(Boolean(getSession())), []);

  if (signedIn) {
    return (
      <Link
        href="/dashboard"
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Dashboard
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link
        href="/login"
        className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Sign in
      </Link>
      <Link
        href="/signup"
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        List your business — free
      </Link>
    </div>
  );
}
