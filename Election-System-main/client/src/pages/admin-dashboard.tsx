import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Loader2, Settings, UserPlus, UserCheck, Vote, Users, ListChecks, TrendingUp, Trophy } from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  const { data: analytics, isLoading } = useQuery({
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
  const { data: proceedings } = useQuery({
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

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
  ];
  const positions = proceedings?.byPosition ?? [];
  const statusCounts = positions.reduce(
    (acc, position) => {
      acc[position.status] = (acc[position.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage elections, candidates, and view results.</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  );
}
