'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';

interface AuditRow {
  id: string;
  action: string;
  at: string;
  payload: { params?: Record<string, string>; body?: unknown } | null;
  user: { email: string } | null;
}

function methodVariant(action: string) {
  if (action.startsWith('DELETE')) return 'destructive' as const;
  if (action.startsWith('POST')) return 'success' as const;
  if (action.startsWith('EXPORT')) return 'info' as const;
  return 'warning' as const; // PATCH / PUT
}

export default function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const limit = 25;

  const reload = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (action) params.set('action', action);
    api<{ data: AuditRow[]; meta: { total: number } }>(`/audit?${params}`)
      .then((r) => {
        setRows(r.data);
        setTotal(r.meta.total);
        setForbidden(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) setForbidden(true);
      });
  }, [page, action]);

  useEffect(() => reload(), [reload]);

  if (forbidden) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" />
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            The audit log is available to workspace admins and owners.
          </CardContent>
        </Card>
      </div>
    );
  }

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every change in this workspace — who did what, when. Secrets are redacted before storage."
        actions={
          <Input
            className="w-64"
            placeholder="Filter by action… (e.g. campaigns)"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          />
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {rows.length === 0 && (
              <p className="p-10 text-center text-sm text-muted-foreground">
                No entries match — mutations will appear here as your team works.
              </p>
            )}
            {rows.map((row) => (
              <button
                key={row.id}
                className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm transition-colors hover:bg-muted/40"
                onClick={() => setExpanded(expanded === row.id ? null : row.id)}
              >
                <Badge variant={methodVariant(row.action)}>{row.action.split(' ')[0]}</Badge>
                <code className="min-w-0 flex-1 truncate text-xs text-foreground/80">
                  {row.action.split(' ').slice(1).join(' ')}
                </code>
                <span className="text-xs text-muted-foreground">{row.user?.email ?? 'system'}</span>
                <span className="w-36 text-right text-xs tabular-nums text-muted-foreground">
                  {new Date(row.at).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
          {expanded && (
            <pre className="max-h-64 overflow-auto border-t bg-muted/30 p-4 text-xs">
              {JSON.stringify(rows.find((r) => r.id === expanded)?.payload, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
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
    </div>
  );
}
