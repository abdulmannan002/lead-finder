'use client';

import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

interface DailyRow {
  day: string;
  leadsScraped: number;
  emailsFound: number;
  sent: number;
  replies: number;
  bounces: number;
  errors: number;
}

const COLUMNS: { key: keyof DailyRow; label: string }[] = [
  { key: 'leadsScraped', label: 'Scraped' },
  { key: 'emailsFound', label: 'Emails found' },
  { key: 'sent', label: 'Sent' },
  { key: 'replies', label: 'Replies' },
  { key: 'bounces', label: 'Bounces' },
  { key: 'errors', label: 'Errors' },
];

export default function MetricsPage() {
  const [rows, setRows] = useState<DailyRow[]>([]);

  useEffect(() => {
    api<DailyRow[]>('/metrics/daily').then((r) => setRows([...r].reverse())).catch(() => {});
  }, []);

  const totals = COLUMNS.map((c) => rows.reduce((sum, r) => sum + (r[c.key] as number), 0));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metrics"
        description="Daily rollups (tenant timezone) — recomputed hourly, finalized at midnight."
      />
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">
              No rollups yet — rows appear once activity lands.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-5 py-3 font-medium">Day</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className="px-4 py-3 text-right font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.day} className="border-b transition-colors last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-2.5 tabular-nums">{row.day.slice(0, 10)}</td>
                      {COLUMNS.map((c) => (
                        <td key={c.key} className="px-4 py-2.5 text-right tabular-nums">
                          {(row[c.key] as number) || <span className="text-muted-foreground">·</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td className="px-5 py-2.5">Total (30d)</td>
                    {totals.map((t, i) => (
                      <td key={i} className="px-4 py-2.5 text-right tabular-nums">
                        {t}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
