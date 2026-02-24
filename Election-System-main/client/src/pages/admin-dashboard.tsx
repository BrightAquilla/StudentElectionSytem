import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Settings, UserPlus, UserCheck, BarChart2, Vote, Users, ListChecks, TrendingUp } from "lucide-react";
import { Link } from "wouter";

export default function AdminDashboard() {
  const { data: analytics, isLoading } = useQuery({
    queryKey: [api.analytics.get.path],
    queryFn: async () => {
      const res = await fetch(api.analytics.get.path);
      if (!res.ok) throw new Error("Failed to load analytics");
      return res.json();
    },
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
    },
    {
      label: "Total Candidates",
      value: analytics?.totalCandidates ?? 0,
      icon: <Users className="w-6 h-6 text-white" />,
      bg: "bg-indigo-400",
    },
    {
      label: "Registered Voters",
      value: analytics?.totalVoters ?? 0,
      icon: <UserCheck className="w-6 h-6 text-white" />,
      bg: "bg-indigo-400",
    },
    {
      label: "Total Votes Cast",
      value: analytics?.totalVotesCast ?? 0,
      icon: <ListChecks className="w-6 h-6 text-white" />,
      bg: "bg-indigo-400",
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
      title: "Verify Voters",
      description: "Review and verify voter registrations",
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage elections, candidates, and view results.</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon, bg }) => (
          <Card key={label} className="shadow-sm border-0 bg-white">
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
    </div>
  );
}