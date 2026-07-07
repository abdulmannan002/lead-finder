'use client';

import { useCallback, useEffect, useState } from 'react';
import { IconDownload } from '@/components/icons';
import { PageHeader } from '@/components/page-header';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api';
import { getSession } from '@/lib/auth';
import { downloadFile } from '@/lib/download';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
const LEAD_STATUSES = ['NEW', 'ENRICHING', 'READY', 'UNREACHABLE', 'DO_NOT_CONTACT', 'BOUNCED', 'ARCHIVED'];

interface QueryRow {
  id: string;
  searchString: string;
  city: string;
  maxResults: number;
  status: string;
  runs: { id: string; status: string; found: number; duplicates: number }[];
}

interface LeadRow {
  id: string;
  company: string;
  websiteDomain: string;
  email: string | null;
  emailSource: string | null;
  emailConfidence: string | null;
  firstLine: string | null;
  phone: string | null;
  city: string | null;
  category: string | null;
  status: string;
  notes: string | null;
}

function QueriesPanel({ onLeadsChanged }: { onLeadsChanged: () => void }) {
  const [queries, setQueries] = useState<QueryRow[]>([]);
  const [searchString, setSearchString] = useState('');
  const [city, setCity] = useState('');
  const [maxResults, setMaxResults] = useState('100');
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api<{ data: QueryRow[] }>('/queries?limit=25')
      .then((r) => setQueries(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);

  async function createQuery() {
    setError(null);
    try {
      await api('/queries', {
        method: 'POST',
        body: { searchString, city, maxResults: Number(maxResults) || 100 },
      });
      setSearchString('');
      setCity('');
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create query');
    }
  }

  async function run(id: string) {
    setError(null);
    try {
      await api(`/queries/${id}/run`, { method: 'POST' });
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start run');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scrape queries</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            className="w-64"
            placeholder="Search string (e.g. logistics companies)"
            value={searchString}
            onChange={(e) => setSearchString(e.target.value)}
          />
          <Input
            className="w-40"
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <Input
            className="w-28"
            type="number"
            min={1}
            max={500}
            value={maxResults}
            onChange={(e) => setMaxResults(e.target.value)}
          />
          <Button onClick={() => void createQuery()} disabled={!searchString || !city}>
            Add query
          </Button>
          <Button variant="ghost" onClick={() => { reload(); onLeadsChanged(); }}>
            Refresh
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {queries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Search</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">Max</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Last run</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {queries.map((q) => (
                  <tr key={q.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{q.searchString}</td>
                    <td className="py-2 pr-4">{q.city}</td>
                    <td className="py-2 pr-4">{q.maxResults}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge status={q.status} />
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {q.runs?.[0]
                        ? `${q.runs[0].status.toLowerCase()} · ${q.runs[0].found} new · ${q.runs[0].duplicates} dupes`
                        : '—'}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        variant="outline"
                        onClick={() => void run(q.id)}
                        disabled={q.status === 'RUNNING'}
                      >
                        Run
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImportPanel({ onImported }: { onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [companyCol, setCompanyCol] = useState('Company');
  const [websiteCol, setWebsiteCol] = useState('Website');
  const [emailCol, setEmailCol] = useState('Email');
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append(
        'mapping',
        JSON.stringify({ company: companyCol, website: websiteCol, email: emailCol || undefined }),
      );
      const res = await fetch(`${API_BASE}/leads/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getSession()?.accessToken}` },
        body: form,
      });
      const body = await res.json();
      if (!res.ok) {
        setResult(body?.error?.message ?? 'Import failed');
      } else {
        setResult(
          `Imported ${body.imported}, duplicates ${body.duplicates}, discarded ${body.discarded}`,
        );
        onImported();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import CSV</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap items-end gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          className="text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Input className="w-36" value={companyCol} onChange={(e) => setCompanyCol(e.target.value)} placeholder="Company column" />
        <Input className="w-36" value={websiteCol} onChange={(e) => setWebsiteCol(e.target.value)} placeholder="Website column" />
        <Input className="w-36" value={emailCol} onChange={(e) => setEmailCol(e.target.value)} placeholder="Email column (opt.)" />
        <Button onClick={() => void upload()} disabled={!file || busy}>
          {busy ? 'Importing…' : 'Import'}
        </Button>
        {result && <p className="w-full text-sm text-muted-foreground">{result}</p>}
      </CardContent>
    </Card>
  );
}

export default function LeadsPage() {
  const { toast } = useToast();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const limit = 25;

  const reload = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    api<{ data: LeadRow[]; meta: { total: number } }>(`/leads?${params}`)
      .then((r) => {
        setLeads(r.data);
        setTotal(r.meta.total);
      })
      .catch(() => {});
  }, [page, status, q]);

  useEffect(() => reload(), [reload]);

  async function patchLead(id: string, body: Record<string, unknown>) {
    try {
      await api(`/leads/${id}`, { method: 'PATCH', body });
      reload();
    } catch {
      reload(); // e.g. SUPPRESSED — refresh to show the true state
    }
  }

  async function runAction(id: string, action: 'enrich' | 'personalize') {
    try {
      await api(`/leads/${id}/${action}`, { method: 'POST' });
      toast(action === 'enrich' ? 'Email finder queued' : 'Opener regeneration queued');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Action failed', 'error');
    }
  }

  async function exportCsv() {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);
    try {
      await downloadFile(`/leads/export?${params}`, 'leads.csv');
      toast('leads.csv downloaded');
    } catch {
      toast('Export failed', 'error');
    }
  }

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leads"
        description="Scraped and imported prospects with enrichment status and editable openers."
        actions={
          <Button variant="outline" onClick={() => void exportCsv()}>
            <IconDownload className="h-4 w-4" /> Export CSV
          </Button>
        }
      />
      <QueriesPanel onLeadsChanged={reload} />
      <ImportPanel onImported={reload} />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="flex-1 text-base">All leads ({total})</CardTitle>
            <Input
              className="w-56"
              placeholder="Search company / domain…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Company</th>
                  <th className="py-2 pr-4">Domain</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">City</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Opener</th>
                  <th className="py-2 pr-4">Notes</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-4 font-medium">{lead.company}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{lead.websiteDomain}</td>
                    <td className="py-2 pr-4">
                      {lead.email ? (
                        <div>
                          <div>{lead.email}</div>
                          <div className="mt-1 flex gap-1">
                            {lead.emailSource && (
                              <Badge variant="outline">{lead.emailSource.toLowerCase()}</Badge>
                            )}
                            {lead.emailConfidence && (
                              <Badge variant={lead.emailConfidence === 'HIGH' ? 'success' : 'neutral'}>
                                {lead.emailConfidence.toLowerCase()}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">{lead.city ?? '—'}</td>
                    <td className="py-2 pr-4">
                      <select
                        className="rounded-md border bg-transparent px-1 py-0.5 text-xs"
                        value={lead.status}
                        disabled={lead.status === 'DO_NOT_CONTACT'}
                        onChange={(e) => void patchLead(lead.id, { status: e.target.value })}
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        className="w-56 rounded-md border bg-transparent px-2 py-1 text-xs"
                        defaultValue={lead.firstLine ?? ''}
                        placeholder="AI opener — editable…"
                        onBlur={(e) => {
                          if (e.target.value !== (lead.firstLine ?? '')) {
                            void patchLead(lead.id, { firstLine: e.target.value });
                          }
                        }}
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        className="w-36 rounded-md border bg-transparent px-2 py-1 text-xs"
                        defaultValue={lead.notes ?? ''}
                        placeholder="notes…"
                        onBlur={(e) => {
                          if (e.target.value !== (lead.notes ?? '')) {
                            void patchLead(lead.id, { notes: e.target.value });
                          }
                        }}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          title="Re-run the email finder"
                          disabled={lead.status === 'DO_NOT_CONTACT'}
                          onClick={() => void runAction(lead.id, 'enrich')}
                        >
                          Find email
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          title="Regenerate the AI opener"
                          disabled={!lead.email || lead.status === 'DO_NOT_CONTACT'}
                          onClick={() => void runAction(lead.id, 'personalize')}
                        >
                          AI opener
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-muted-foreground">
                      No leads yet — run a scrape query or import a CSV.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-end gap-2 text-sm">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Prev
              </Button>
              <span className="text-muted-foreground">
                {page} / {pages}
              </span>
              <Button variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
