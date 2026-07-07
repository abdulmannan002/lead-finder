'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/api';

function VerifyEmailInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [detail, setDetail] = useState('');

  useEffect(() => {
    if (!token) {
      setState('failed');
      setDetail('The verification link is missing its token.');
      return;
    }
    api<{ verified: boolean; email: string }>('/auth/verify-email/confirm', {
      method: 'POST',
      body: { token },
      auth: false,
    })
      .then((res) => {
        setState('done');
        setDetail(res.email);
      })
      .catch((err) => {
        setState('failed');
        setDetail(
          err instanceof ApiError ? err.message : 'The link may be expired or already used.',
        );
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 text-center shadow-sm">
        <span className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
          S
        </span>
        {state === 'working' && (
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        )}
        {state === 'done' && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Email verified ✓</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {detail} now carries the verified badge on your public listing and offers.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Continue to sign in
            </Link>
          </>
        )}
        {state === 'failed' && (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Verification failed</h1>
            <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
            <p className="mt-4 text-xs text-muted-foreground">
              Request a fresh link from your business profile page after signing in.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-muted"
            >
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}
