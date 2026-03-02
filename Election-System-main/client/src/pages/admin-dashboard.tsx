import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Settings, UserPlus, UserCheck, Vote, Users, ListChecks, TrendingUp, Trophy, ShieldCheck, Activity, Clock3 } from "lucide-react";
import { Link } from "wouter";

type PerformanceMetric = {
  method: string;
  path: string;
  count: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
  lastStatus: number;
};

type ActivityEntry = {
  id: string;
  summary: string;
  scope: string;
  actor?: string;
  status: "info" | "success" | "warning" | "error";
  at: string;
};

export default function AdminDashboard() {
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);

  const { data: analytics, isLoading, isError: analyticsErrored, refetch: refetchAnalytics } = useQuery({
    queryKey: [api.analytics.get.path],
    queryFn: async () => {
      const res = await fetch(api.analytics.get.path);
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const { data: proceedings, refetch: refetchProceedings } = useQuery({
    queryKey: [api.analytics.proceedings.path, "admin-dashboard"],
    queryFn: async () => {
      const res = await fetch(api.analytics.proceedings.path);
      if (!res.ok) throw new Error("Failed to load proceedings analytics");
      return api.analytics.proceedings.responses[200].parse(await res.json());
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const { data: performance, refetch: refetchPerformance } = useQuery<{
    capturedAt: string;
    metrics: PerformanceMetric[];
  }>({
    queryKey: ["/api/performance/metrics"],
    queryFn: async () => {
      const res = await fetch("/api/performance/metrics");
      if (!res.ok) throw new Error("Failed to load performance metrics");
      return res.json();
    },
    refetchInterval: 5000,
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
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.event === "vote_cast") {
          refetchAnalytics();
          refetchProceedings();
          refetchPerformance();
          return;
        }
        if (payload?.event === "activity" && payload?.data) {
          const item: ActivityEntry = {
            id: `${payload.at}-${payload.data.type}-${Math.random().toString(36).slice(2, 8)}`,
            summary: String(payload.data.summary || "System activity"),
            scope: String(payload.data.scope || "system"),
            actor: payload.data.actor ? String(payload.data.actor) : undefined,
            status: (["info", "success", "warning", "error"].includes(payload.data.status)
              ? payload.data.status
              : "info") as ActivityEntry["status"],
            at: String(payload.at || new Date().toISOString()),
          };
          setActivityFeed((current) => [item, ...current].slice(0, 8));
          if (["users", "votes", "elections", "candidates", "auth"].includes(item.scope)) {
            refetchAnalytics();
            refetchProceedings();
            refetchPerformance();
          }
        }
      } catch {
        // no-op
      }
    };
    return () => ws.close();
  }, [refetchAnalytics, refetchPerformance, refetchProceedings]);

  const stats = [
    {
      label: "Total Elections",
      value: analytics?.totalElections ?? 0,
      icon: <Vote className="w-6 h-6 text-white" />,
      bg: "bg-indigo-400",
      href: "/admin/elections",
    },
    {
      label: "Total Candidates",
      value: analytics?.totalCandidates ?? 0,
      icon: <Users className="w-6 h-6 text-white" />,
      bg: "bg-indigo-400",
      href: "/admin/candidates",
    },
    {
      label: "Registered Voters",
      value: analytics?.totalVoters ?? 0,
      icon: <UserCheck className="w-6 h-6 text-white" />,
      bg: "bg-indigo-400",
      href: "/admin/voters",
    },
    {
      label: "Voters Participated",
      value: analytics?.totalVotesCast ?? 0,
      icon: <ListChecks className="w-6 h-6 text-white" />,
      bg: "bg-indigo-400",
      href: "/admin/analytics",
    },
  ];

  const actions = [
    {
      title: "Manage Elections",
      description: "Set up new elections and manage existing ones",
      icon: <Settings className="w-10 h-10 text-indigo-500" />,
      href: "/admin/elections",
    },
    {
      title: "Manage Candidates",
      description: "Review and approve candidate applications",
      icon: <UserPlus className="w-10 h-10 text-indigo-500" />,
      href: "/admin/candidates",
    },
    {
      title: "Manage Voters",
      description: "Add, update, and control voter accounts",
      icon: <UserCheck className="w-10 h-10 text-indigo-500" />,
      href: "/admin/voters",
    },
    {
      title: "View Results",
      description: "Monitor election results and analytics",
      icon: <TrendingUp className="w-10 h-10 text-indigo-500" />,
      href: "/admin/analytics",
    },
    {
      title: "Audit Trail",
      description: "Inspect approvals, blocked votes, and publishing events",
      icon: <ShieldCheck className="w-10 h-10 text-indigo-500" />,
      href: "/admin/audit-logs",
    },
    {
      title: "Stress Monitor",
      description: "Watch throughput, failures, and latency during load simulations",
      icon: <Activity className="w-10 h-10 text-indigo-500" />,
      href: "/admin/stress-monitor",
    },
  ];
  const positions = proceedings?.byPosition ?? [];
  const topTraffic = useMemo(
    () => [...(performance?.metrics ?? [])].sort((a, b) => b.count - a.count).slice(0, 5),
    [performance],
  );
  const statusCounts = positions.reduce(
    (acc, position) => {
      acc[position.status] = (acc[position.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Manage elections, candidates, and view results.</p>
          {isLoading && (
            <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading dashboard metrics...
            </p>
          )}
          {analyticsErrored && !isLoading && (
            <p className="text-xs text-destructive mt-2">
              Some admin metrics could not be loaded. Core controls are still available.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={isLiveConnected ? "default" : "secondary"}>
            {isLiveConnected ? "Live control feed" : "Reconnecting live feed"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {performance?.capturedAt ? `Traffic snapshot: ${new Date(performance.capturedAt).toLocaleTimeString()}` : "Waiting for traffic snapshot"}
          </span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {stats.map(({ label, value, icon, bg, href }) => (
          <Link key={label} href={href}>
            <Card className="shadow-sm border-0 bg-white cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex items-center gap-4">
                <div className={`${bg} p-3 rounded-xl flex items-center justify-center`}>
                  {icon}
                </div>
                <div>
                  <div className="text-2xl font-bold text-foreground">{value}</div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map(({ title, description, icon, href }) => (
          <Link key={title} href={href}>
            <Card className="h-full cursor-pointer border-2 border-transparent hover:border-indigo-400 hover:shadow-md transition-all duration-200 bg-white group">
              <CardContent className="p-8 flex flex-col items-center text-center gap-4">
                <div className="p-3 rounded-full bg-indigo-50 group-hover:bg-indigo-100 transition-colors">
                  {icon}
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-lg">{title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{description}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="bg-white">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Election Status Overview</h3>
              <Badge variant="secondary">Control Center</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{statusCounts.Active ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Upcoming</p>
                <p className="text-xl font-bold">{statusCounts.Upcoming ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Ended</p>
                <p className="text-xl font-bold">{statusCounts.Ended ?? 0}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-muted-foreground">Inactive</p>
                <p className="text-xl font-bold">{statusCounts.Inactive ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Position Pulse</h3>
              <Link href="/admin/analytics" className="text-sm text-primary hover:underline">Open analyst view</Link>
            </div>
            <div className="space-y-3">
              {positions.slice(0, 4).map((position) => {
                const sorted = [...position.candidates].sort((a, b) => b.voteCount - a.voteCount);
                const leader = sorted[0];
                const share = position.totalVotes > 0 && leader ? (leader.voteCount / position.totalVotes) * 100 : 0;
                return (
                  <div key={position.position} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-medium">{position.position}</span>
                      <span className="text-muted-foreground">{position.totalVotes} votes</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Trophy className="h-3.5 w-3.5" />
                      <span>{leader ? `${leader.candidateName} leads` : "No leader yet"}</span>
                    </div>
                    <Progress value={Math.min(share, 100)} />
                  </div>
                );
              })}
              {positions.length === 0 && (
                <p className="text-sm text-muted-foreground">No election analytics available yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="bg-white">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Live Activity Feed</h3>
              <Badge variant="outline">Realtime</Badge>
            </div>
            <div className="space-y-3">
              {activityFeed.length === 0 && (
                <p className="text-sm text-muted-foreground">Waiting for live activity. Logins, registrations, votes, and admin changes will appear here instantly.</p>
              )}
              {activityFeed.map((entry) => (
                <div key={entry.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          entry.status === "success"
                            ? "bg-emerald-500"
                            : entry.status === "warning"
                              ? "bg-amber-500"
                              : entry.status === "error"
                                ? "bg-red-500"
                                : "bg-sky-500"
                        }`}
                      />
                      <span className="font-medium truncate">{entry.summary}</span>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(entry.at).toLocaleTimeString()}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="uppercase tracking-wide">{entry.scope}</span>
                    {entry.actor && <span>Actor: {entry.actor}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Traffic Health</h3>
              <Badge variant="secondary">Live requests</Badge>
            </div>
            <div className="space-y-3">
              {topTraffic.length === 0 && (
                <p className="text-sm text-muted-foreground">No endpoint traffic captured yet.</p>
              )}
              {topTraffic.map((metric) => (
                <div key={`${metric.method}-${metric.path}`} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{metric.method} {metric.path}</p>
                      <p className="text-xs text-muted-foreground">
                        {metric.count} requests • avg {metric.averageMs}ms • p95 {metric.p95Ms}ms
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <Activity className="h-3.5 w-3.5" />
                        <span>{metric.lastStatus}</span>
                      </div>
                      <div className="inline-flex items-center gap-1 ml-3">
                        <Clock3 className="h-3.5 w-3.5" />
                        <span>max {metric.maxMs}ms</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
