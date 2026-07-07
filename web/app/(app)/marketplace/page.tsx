'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';

interface Profile {
  slug?: string;
  displayName?: string;
  category?: string;
  services?: string[];
  description?: string;
  city?: string;
  phone?: string;
  whatsapp?: string;
  websiteUrl?: string;
  published?: boolean;
  exists?: boolean;
}

export default function MarketplaceProfilePage() {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [form, setForm] = useState({
    displayName: '',
    category: '',
    services: '',
    description: '',
    city: '',
    phone: '',
    whatsapp: '',
    websiteUrl: '',
  });
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    api<Profile>('/business-profile')
      .then((p) => {
        if (p && !('exists' in p && p.exists === false)) {
          setSlug(p.slug ?? null);
          setPublished(Boolean(p.published));
          setForm({
            displayName: p.displayName ?? '',
            category: p.category ?? '',
            services: (p.services ?? []).join(', '),
            description: p.description ?? '',
            city: p.city ?? '',
            phone: p.phone ?? '',
            whatsapp: p.whatsapp ?? '',
            websiteUrl: p.websiteUrl ?? '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(nextPublished?: boolean) {
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        displayName: form.displayName.trim(),
        category: form.category.trim(),
        services: form.services
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        ...(form.description.trim() ? { description: form.description.trim() } : {}),
        ...(form.city.trim() ? { city: form.city.trim() } : {}),
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(form.whatsapp.trim() ? { whatsapp: form.whatsapp.trim() } : {}),
        ...(form.websiteUrl.trim() ? { websiteUrl: form.websiteUrl.trim() } : {}),
        ...(nextPublished !== undefined ? { published: nextPublished } : {}),
      };
      const saved = await api<Profile>('/business-profile', { method: 'PUT', body });
      setSlug(saved.slug ?? null);
      setPublished(Boolean(saved.published));
      toast(
        nextPublished === true
          ? 'Profile published — you are live in the directory'
          : nextPublished === false
            ? 'Profile unpublished'
            : 'Profile saved',
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function generateDescription() {
    setAiBusy(true);
    try {
      const res = await api<{ description: string }>('/business-profile/generate-description', {
        method: 'POST',
      });
      setForm((f) => ({ ...f, description: res.description }));
      toast('Description written — edit it or save as is');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Generation failed', 'error');
    } finally {
      setAiBusy(false);
    }
  }

  async function requestVerification() {
    try {
      await api('/auth/verify-email/request', { method: 'POST' });
      toast('Verification email sent — check your inbox');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send email', 'error');
    }
  }

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Business profile"
        description="Your free public listing on SignX Market — it also decides which buyer requests reach you."
        actions={
          <div className="flex items-center gap-2">
            {slug && published && (
              <a
                href={`/market/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-primary hover:underline"
              >
                View public page ↗
              </a>
            )}
            <Badge variant={published ? 'success' : 'warning'}>
              {published ? 'published' : 'draft'}
            </Badge>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listing details</CardTitle>
          <CardDescription>
            Category and services drive request matching — list what you actually offer.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Business name</Label>
              <Input id="displayName" value={form.displayName} onChange={set('displayName')} placeholder="Craft Software House" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category">Category</Label>
              <Input id="category" value={form.category} onChange={set('category')} placeholder="software development" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="services">Services (comma-separated)</Label>
            <Input id="services" value={form.services} onChange={set('services')} placeholder="POS systems, inventory software, web apps" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="description">Description</Label>
              <Button
                type="button"
                variant="outline"
                className="h-7 px-2.5 text-xs"
                disabled={aiBusy || !form.displayName.trim()}
                onClick={() => void generateDescription()}
              >
                {aiBusy ? 'Writing…' : '✨ Write with AI'}
              </Button>
            </div>
            <textarea
              id="description"
              value={form.description}
              onChange={set('description')}
              rows={4}
              placeholder="What you do, who you serve, why buyers should pick you."
              className="w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {!slug && (
              <p className="text-xs text-muted-foreground">
                Save the profile once, then AI can write the description from your details.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={form.city} onChange={set('city')} placeholder="Lahore" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="websiteUrl">Website (optional)</Label>
              <Input id="websiteUrl" value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={form.phone} onChange={set('phone')} placeholder="+92 42 1234567" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input id="whatsapp" value={form.whatsapp} onChange={set('whatsapp')} placeholder="+92 300 1234567" />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button disabled={busy || !form.displayName.trim() || !form.category.trim()} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save profile'}
            </Button>
            {slug && (
              <Button
                variant={published ? 'outline' : 'default'}
                disabled={busy}
                onClick={() => void save(!published)}
              >
                {published ? 'Unpublish' : 'Publish to directory'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Verified badge</CardTitle>
          <CardDescription>
            Buyers trust verified listings. Confirm your email to get the green badge on your
            public page and offers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => void requestVerification()}>
            Send verification email
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
