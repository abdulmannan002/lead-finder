'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    // Logged-out visitors land on the public marketplace, not a login wall.
    router.replace(getSession() ? '/dashboard' : '/market');
  }, [router]);
  return null;
}
