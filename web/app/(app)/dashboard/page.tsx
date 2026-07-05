'use client';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getSession } from '@/lib/auth';

export default function DashboardPage() {
  const session = getSession();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {session ? `Welcome, ${session.tenant.name}` : 'Dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Sends, replies and pipeline health will land here in M4.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['Leads', 'Active campaigns', 'Sends today', 'Replies'].map((label) => (
          <Card key={label}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-3xl">—</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
