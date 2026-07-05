'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, ApiError } from '@/lib/api';
import { saveSession, StoredSession } from '@/lib/auth';

function AcceptInviteForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function accept(withPassword: boolean, e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const session = await api<StoredSession>('/auth/accept-invite', {
        method: 'POST',
        body: withPassword ? { token, password } : { token },
        auth: false,
      });
      saveSession(session);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'PASSWORD_REQUIRED') {
        setError('Set a password to create your account');
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong');
      }
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <p className="text-sm text-destructive">This invitation link is missing its token.</p>;
  }

  return (
    <form onSubmit={(e) => void accept(password.length > 0, e)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          minLength={8}
          placeholder="Leave empty if you already have an account"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Joining…' : 'Accept invitation'}
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Join workspace</CardTitle>
          <CardDescription>
            Existing accounts join instantly — new here? Choose a password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={null}>
            <AcceptInviteForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
