'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { IconPlus } from '@/components/icons';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';

interface RequestRow {
  id: string;
  title: string;
  category: string;
  city: string | null;
  budget: string | null;
  status: string;
  createdAt: string;
  _count: { responses: number };
}

function NewRequestForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    city: '',
    budget: '',
    remoteOk: true,
  });
  const [busy, setBusy] = useState(false);

  const set = (key: 'title' | 'description' | 'category' | 'city' | 'budget') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit() {
    setBusy(true);
    try {
      const res = await api<{ notifiedProviders: number }>('/requests', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          description: form.description.trim(),
          category: form.category.trim(),
          remoteOk: form.remoteOk,
          ...(form.city.trim() ? { city: form.city.trim() } : {}),
          ...(form.budget.trim() ? { budget: form.budget.trim() } : {}),
        },
      });
      toast(
        res.notifiedProviders > 0
          ? `Request posted — ${res.notifiedProviders} matching ${res.notifiedProviders === 1 ? 'business' : 'businesses'} notified`
          : 'Request posted — providers joining the directory will see it',
      );
      setForm({ title: '', description: '', category: '', city: '', budget: '', remoteOk: true });
      onCreated();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not post the request', 'error');
    } finally {
      setBusy(false);
    }
  }

  const valid = form.title.trim() && form.category.trim() && form.description.trim().length >= 20;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Post a request</CardTitle>
        <CardDescription>
          Matching businesses are notified instantly and respond with offers you can compare.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="title">What do you need?</Label>
            <Input id="title" value={form.title} onChange={set('title')} placeholder="Need a POS system for my retail store" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={form.category} onChange={set('category')} placeholder="software development" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="budget">Budget (optional)</Label>
            <Input id="budget" value={form.budget} onChange={set('budget')} placeholder="PKR 200k" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City (optional)</Label>
            <Input id="city" value={form.city} onChange={set('city')} placeholder="Lahore" />
          </div>
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={form.remoteOk}
                onChange={(e) => setForm((f) => ({ ...f, remoteOk: e.target.checked }))}
              />
              remote providers welcome
            </label>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="description">Details</Label>
          <textarea
            id="description"
            value={form.description}
            onChange={set('description')}
            rows={4}
            placeholder="Describe the work, timeline, and anything a provider should know (at least 20 characters)."
            className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
        <Button disabled={!valid || busy} onClick={() => void submit()}>
          <IconPlus className="h-4 w-4" /> {busy ? 'Posting…' : 'Post request'}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function RequestsPage() {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(() => {
    api<{ data: RequestRow[] }>('/requests/mine?limit=50')
      .then((r) => {
        setRows(r.data);
        if (r.data.length === 0) setShowForm(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My requests"
        description="Post what you need — matched businesses reply with offers."
        actions={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <IconPlus className="h-4 w-4" /> New request
            </Button>
          )
        }
      />

      {showForm && (
        <NewRequestForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      {rows.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-6 py-3 font-medium">Request</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Offers</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 text-right font-medium">Posted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-6 py-3">
                      <Link href={`/requests/${row.id}`} className="font-medium text-primary hover:underline">
                        {row.title}
                      </Link>
                      {row.budget && (
                        <span className="ml-2 text-xs text-muted-foreground">{row.budget}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">{row.category}</td>
                    <td className="px-4 py-3">
                      <span className={row._count.responses > 0 ? 'font-semibold text-primary' : 'text-muted-foreground'}>
                        {row._count.responses}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-6 py-3 text-right text-xs text-muted-foreground">
                      {new Date(row.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
