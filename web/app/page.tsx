'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    router.replace(getSession() ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
