import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, Activity, Gauge, ShieldAlert, TimerReset, TriangleAlert } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";

type PerformanceMetric = {
  method: string;
  path: string;
  count: number;
  errorCount: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
  lastStatus: number;
};

type PerformanceSnapshot = {
  capturedAt: string;
  totalRequests: number;
  totalFailures: number;
  weightedAverageMs: number;
  peakP95: number;
};

type ActivityMetric = {
  activity: string;
  count: number;
  errorCount: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
  lastStatus: number;
};

type PerformanceResponse = {
  capturedAt: string;
  metrics: PerformanceMetric[];
  activityMetrics: ActivityMetric[];
  history: PerformanceSnapshot[];
};

type HistoryPoint = {
  time: string;
  requestsPerSecond: number;
  failuresPerMinute: number;
  peakP95: number;
  weightedAverageMs: number;
};

export default function AdminStressMonitor() {
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  const { data, isLoading, refetch } = useQuery<PerformanceResponse>({
    queryKey: ["/api/performance/metrics", "stress-monitor"],
    queryFn: async () => {
      const res = await fetch("/api/performance/metrics");
      if (!res.ok) throw new Error("Failed to load performance metrics");
      return res.json();
    },
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    ws.onopen = () => setIsLiveConnected(true);
    ws.onclose = () => setIsLiveConnected(false);
    ws.onerror = () => setIsLiveConnected(false);
    ws.onmessage = () => {
      void refetch();
    };
    return () => ws.close();
  }, [refetch]);

  const history = useMemo<HistoryPoint[]>(() => {
    const snapshots = data?.history ?? [];
    const computed = snapshots.map((snapshot, index) => {
      const previous = index > 0 ? snapshots[index - 1] : null;
      const currentAt = new Date(snapshot.capturedAt).getTime();
      const previousAt = previous ? new Date(previous.capturedAt).getTime() : currentAt;
      const elapsedSeconds = Math.max(1, (currentAt - previousAt) / 1000);
      const requestDelta = previous ? Math.max(0, snapshot.totalRequests - previous.totalRequests) : 0;
      const failureDelta = previous ? Math.max(0, snapshot.totalFailures - previous.totalFailures) : 0;

      return {
        time: new Date(snapshot.capturedAt).toLocaleTimeString(),
        requestsPerSecond: Number((requestDelta / elapsedSeconds).toFixed(1)),
        failuresPerMinute: Number(((failureDelta / elapsedSeconds) * 60).toFixed(1)),
        peakP95: snapshot.peakP95,
        weightedAverageMs: snapshot.weightedAverageMs,
      };
    });

    if (computed.length === 0) {
      const now = new Date().toLocaleTimeString();
      return [
        { time: "Baseline", requestsPerSecond: 0, failuresPerMinute: 0, peakP95: 0, weightedAverageMs: 0 },
        { time: now, requestsPerSecond: 0, failuresPerMinute: 0, peakP95: 0, weightedAverageMs: 0 },
      ];
    }

    if (computed.length === 1) {
      return [
        { time: "Baseline", requestsPerSecond: 0, failuresPerMinute: 0, peakP95: 0, weightedAverageMs: 0 },
        computed[0],
      ];
    }

    return computed;
  }, [data]);

  const summary = useMemo(() => {
    const metrics = data?.metrics ?? [];
    const totalRequests = metrics.reduce((sum, metric) => sum + metric.count, 0);
    const totalFailures = metrics.reduce((sum, metric) => sum + metric.errorCount, 0);
    const hottestEndpoint = [...metrics].sort((a, b) => b.count - a.count)[0];
    const slowestEndpoint = [...metrics].sort((a, b) => b.p95Ms - a.p95Ms)[0];
    const failureRate = totalRequests > 0 ? (totalFailures / totalRequests) * 100 : 0;
    return {
      totalRequests,
      totalFailures,
      failureRate,
      hottestEndpoint,
      slowestEndpoint,
    };
  }, [data]);

  const activityMetrics = data?.activityMetrics ?? [];
  const activityLookup = useMemo(
    () => new Map(activityMetrics.map((metric) => [metric.activity, metric])),
    [activityMetrics],
  );
  const trackedActivities = useMemo(
    () => [
      {
        key: "voting",
        title: "Voting Activity",
        description: "Ballot submission and vote-write pressure.",
        accent: "text-indigo-700",
      },
      {
        key: "registration",
        title: "Account Creation",
        description: "New account registration load.",
        accent: "text-emerald-700",
      },
      {
        key: "authentication",
        title: "Authentication",
        description: "Login and logout request flow.",
        accent: "text-sky-700",
      },
      {
        key: "account",
        title: "Account Usage",
        description: "Profile and session-linked user actions.",
        accent: "text-violet-700",
      },
      {
        key: "user_management",
        title: "User Management",
        description: "Admin user operations and account controls.",
        accent: "text-amber-700",
      },
      {
        key: "candidate_workflow",
        title: "Candidate Workflow",
        description: "Candidate applications and campaign actions.",
        accent: "text-rose-700",
      },
      {
        key: "election_management",
        title: "Election Processing",
        description: "Election creation, updates, and ballot maintenance.",
        accent: "text-cyan-700",
      },
      {
        key: "system_processing",
        title: "System Processing",
        description: "Audit and monitoring endpoints plus other server processing.",
        accent: "text-slate-700",
      },
    ],
    [],
  );
  const voteMetric = activityLookup.get("voting");
  const primaryUserActivities = trackedActivities.map((activity) => ({
    ...activity,
    metric: activityLookup.get(activity.key),
  }));

  const alerts = useMemo(() => {
    const current = history[history.length - 1];
    const recent = history.slice(-6, -1);
    const recentAverageRps = recent.length > 0
      ? recent.reduce((sum, point) => sum + point.requestsPerSecond, 0) / recent.length
      : 0;
    const messages: Array<{
      title: string;
      description: string;
      variant: "default" | "destructive";
    }> = [];

    if (summary.failureRate >= 5) {
      messages.push({
        title: "High failure rate",
        description: `Failure rate is ${summary.failureRate.toFixed(1)}%. The system is dropping more requests than expected.`,
        variant: "destructive",
      });
    }

    if ((current?.peakP95 ?? 0) >= 1500) {
      messages.push({
        title: "Latency degradation detected",
        description: `Peak p95 is ${current?.peakP95 ?? 0}ms. Responses are now materially slower under the current load.`,
        variant: "destructive",
      });
    }

    if (recentAverageRps > 0 && current && current.requestsPerSecond < recentAverageRps * 0.65) {
      messages.push({
        title: "Throughput drop detected",
        description: `Current throughput (${current.requestsPerSecond.toFixed(1)} req/s) is well below the recent average (${recentAverageRps.toFixed(1)} req/s).`,
        variant: "default",
      });
    }

    return messages;
  }, [history, summary.failureRate]);

  if (isLoading && !data) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Stress Monitor</h1>
          <p className="text-muted-foreground mt-1">
            Watch live throughput, failures, and latency while the background simulator or real users hit the system.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={isLiveConnected ? "default" : "secondary"}>
            {isLiveConnected ? "Live telemetry connected" : "Reconnecting telemetry"}
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await fetch("/api/performance/metrics/reset", { method: "POST" });
              void refetch();
            }}
          >
            <TimerReset className="h-4 w-4 mr-2" />
            Reset Metrics
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border-0 text-white shadow-lg bg-gradient-to-br from-sky-500 via-cyan-500 to-blue-700">
          <CardContent className="p-5 flex items-center gap-3">
            <Activity className="h-5 w-5 text-white" />
            <div>
              <p className="text-xs text-sky-100">Captured Requests</p>
              <p className="text-2xl font-bold text-white">{summary.totalRequests}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 text-white shadow-lg bg-gradient-to-br from-rose-500 via-red-500 to-orange-600">
          <CardContent className="p-5 flex items-center gap-3">
            <ShieldAlert className="h-5 w-5 text-white" />
            <div>
              <p className="text-xs text-rose-100">Failed Requests</p>
              <p className="text-2xl font-bold text-white">{summary.totalFailures}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 text-white shadow-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-purple-700">
          <CardContent className="p-5 flex items-center gap-3">
            <Gauge className="h-5 w-5 text-white" />
            <div>
              <p className="text-xs text-violet-100">Failure Rate</p>
              <p className="text-2xl font-bold text-white">{summary.failureRate.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 text-white shadow-lg bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-700">
          <CardContent className="p-5 flex items-center gap-3">
            <Activity className="h-5 w-5 text-white" />
            <div>
              <p className="text-xs text-emerald-100">Current Peak p95</p>
              <p className="text-2xl font-bold text-white">{history[history.length - 1]?.peakP95 ?? 0}ms</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <Alert key={`${alert.title}-${index}`} variant={alert.variant}>
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>{alert.description}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border-indigo-200 bg-gradient-to-br from-white to-indigo-50">
          <CardHeader>
            <CardTitle>Vote Pipeline Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-indigo-100 bg-white/80 p-4">
                <p className="text-xs text-muted-foreground">Vote Requests</p>
                <p className="text-2xl font-bold text-indigo-700">{voteMetric?.count ?? 0}</p>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-white/80 p-4">
                <p className="text-xs text-muted-foreground">Vote Errors</p>
                <p className="text-2xl font-bold text-rose-600">{voteMetric?.errorCount ?? 0}</p>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-white/80 p-4">
                <p className="text-xs text-muted-foreground">Vote Avg</p>
                <p className="text-xl font-bold text-emerald-700">{voteMetric?.averageMs ?? 0}ms</p>
              </div>
              <div className="rounded-lg border border-indigo-100 bg-white/80 p-4">
                <p className="text-xs text-muted-foreground">Vote p95</p>
                <p className="text-xl font-bold text-violet-700">{voteMetric?.p95Ms ?? 0}ms</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              This isolates vote-write load so you can see immediately whether ballot submissions are the main source of pressure.
            </p>
          </CardContent>
        </Card>

        <Card className="border-cyan-200 bg-gradient-to-br from-white to-cyan-50">
          <CardHeader>
            <CardTitle>User Activity Pressure</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {primaryUserActivities.map(({ key, title, description, accent, metric }) => (
              <div key={key} className="rounded-lg border border-cyan-100 bg-white/80 p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div>
                    <span className={`font-medium ${accent}`}>{title}</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
                  </div>
                  <span className="text-muted-foreground">{metric?.count ?? 0} req</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  errors {metric?.errorCount ?? 0} | avg {metric?.averageMs ?? 0}ms | p95 {metric?.p95Ms ?? 0}ms
                </p>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-cyan-200 bg-cyan-50/60 p-3">
              <p className="text-xs font-medium text-cyan-800">Analytics traffic is still measured</p>
              <p className="mt-1 text-xs text-muted-foreground">
                It is intentionally not a primary signal here. The dashboard is weighted toward direct user actions and server processing work.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border-sky-200 bg-gradient-to-br from-white to-sky-50">
          <CardHeader>
            <CardTitle>Request Throughput</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="requestsPerSecond" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, fill: "#0284c7" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-rose-200 bg-gradient-to-br from-white to-rose-50">
          <CardHeader>
            <CardTitle>Failure Pressure</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="failuresPerMinute" fill="#ef4444" radius={[6, 6, 0, 0]} minPointSize={4} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="border-emerald-200 bg-gradient-to-br from-white to-emerald-50">
          <CardHeader>
            <CardTitle>Latency Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line type="monotone" dataKey="weightedAverageMs" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: "#059669" }} />
                <Line type="monotone" dataKey="peakP95" stroke="#8b5cf6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-gradient-to-br from-white to-amber-50">
          <CardHeader>
            <CardTitle>Endpoint Watchlist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Hottest Endpoint</p>
              <p className="text-sm font-semibold mt-1">
                {summary.hottestEndpoint ? `${summary.hottestEndpoint.method} ${summary.hottestEndpoint.path}` : "No traffic yet"}
              </p>
              {summary.hottestEndpoint && (
                <p className="text-xs text-muted-foreground mt-1">
                  {summary.hottestEndpoint.count} requests, {summary.hottestEndpoint.errorCount} errors
                </p>
              )}
            </div>
            <div className="rounded-lg border p-4">
              <p className="text-xs text-muted-foreground">Slowest Endpoint (p95)</p>
              <p className="text-sm font-semibold mt-1">
                {summary.slowestEndpoint ? `${summary.slowestEndpoint.method} ${summary.slowestEndpoint.path}` : "No traffic yet"}
              </p>
              {summary.slowestEndpoint && (
                <p className="text-xs text-muted-foreground mt-1">
                  p95 {summary.slowestEndpoint.p95Ms}ms, max {summary.slowestEndpoint.maxMs}ms
                </p>
              )}
            </div>
            <div className="space-y-2">
              {(data?.metrics ?? []).slice(0, 6).map((metric) => (
                <div key={`${metric.method}-${metric.path}`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium truncate">{metric.method} {metric.path}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{metric.count} req</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    errors {metric.errorCount} | avg {metric.averageMs}ms | p95 {metric.p95Ms}ms | max {metric.maxMs}ms
                  </p>
                </div>
              ))}
              {(data?.metrics ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No endpoint metrics captured yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
