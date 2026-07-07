'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { getSession } from '@/lib/auth';

interface Overview {
  pipeline: Record<string, number>;
  activeCampaigns: number;
  last30d: { sent: number; replies: number; replyRate: number };
}

interface DailyRow {
  day: string;
  sent: number;
  replies: number;
  bounces: number;
}

interface Funnel {
  leads: number;
  enrolled: number;
  sent: number;
  replied: number;
  won: number;
}

interface NotificationRow {
  id: string;
  type: string;
  payload: { text?: string };
  createdAt: string;
  readAt: string | null;
}

function Scorecard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max > 0 ? Math.max(2, (value / max) * 100) : 2;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-20 text-muted-foreground">{label}</span>
      <div className="h-5 flex-1 rounded bg-muted">
        <div
          className="flex h-5 items-center rounded bg-primary/80 px-2 text-xs text-primary-foreground"
          style={{ width: `${width}%` }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const session = getSession();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);

  const reload = useCallback(() => {
    api<Overview>('/metrics/overview').then(setOverview).catch(() => {});
    api<DailyRow[]>('/metrics/daily').then(setDaily).catch(() => {});
    api<Funnel>('/metrics/funnel').then(setFunnel).catch(() => {});
    api<{ data: NotificationRow[]; unread: number }>('/notifications?limit=5')
      .then((r) => {
        setNotifications(r.data);
        setUnread(r.unread);
      })
      .catch(() => {});
  }, []);

  useEffect(() => reload(), [reload]);

  async function markRead(id: string) {
    await api(`/notifications/${id}/read`, { method: 'POST' }).catch(() => {});
    reload();
  }

  const chartData = daily.map((d) => ({ ...d, day: d.day.slice(0, 10) }));
  const pipeline = overview?.pipeline ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {session ? `${session.tenant.name} — overview` : 'Dashboard'}
        </h1>
        <p className="text-sm text-muted-foreground">Last 30 days.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Scorecard label="Leads ready" value={pipeline.READY ?? 0} />
        <Scorecard label="Active campaigns" value={overview?.activeCampaigns ?? 0} />
        <Scorecard label="Sent (30d)" value={overview?.last30d.sent ?? 0} />
        <Scorecard
          label="Reply rate (30d)"
          value={`${(((overview?.last30d.replyRate ?? 0) * 100) || 0).toFixed(1)}%`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sends, replies & bounces</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No rollups yet — data appears after the first sends.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 91%)" />
                  <XAxis dataKey="day" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} width={28} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="sent" stroke="#2563eb" dot={false} />
                  <Line type="monotone" dataKey="replies" stroke="#16a34a" dot={false} />
                  <Line type="monotone" dataKey="bounces" stroke="#dc2626" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline funnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {funnel && (
              <>
                <FunnelBar label="leads" value={funnel.leads} max={funnel.leads} />
                <FunnelBar label="enrolled" value={funnel.enrolled} max={funnel.leads} />
                <FunnelBar label="contacted" value={funnel.sent} max={funnel.leads} />
                <FunnelBar label="replied" value={funnel.replied} max={funnel.leads} />
                <FunnelBar label="won" value={funnel.won} max={funnel.leads} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base">Notifications</CardTitle>
            {unread > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {unread} new
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {notifications.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          )}
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`flex items-start gap-2 rounded-md border p-2 text-sm ${n.readAt ? 'opacity-60' : ''}`}
            >
              <span className="rounded bg-muted px-1 text-[10px] uppercase">{n.type}</span>
              <span className="flex-1 whitespace-pre-wrap">{n.payload?.text ?? ''}</span>
              {!n.readAt && (
                <Button variant="ghost" className="h-6 px-2 text-xs" onClick={() => void markRead(n.id)}>
                  Mark read
                </Button>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
