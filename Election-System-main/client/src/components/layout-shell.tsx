import React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useAuth } from "@/hooks/use-auth";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { 
  LogOut, 
  LayoutDashboard, 
  Vote, 
  User, 
  BarChart3,
  Users,
  ListChecks,
  Trophy,
  ShieldCheck,
  Activity,
  Flag
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const isAdmin = user?.isAdmin;
  const isAnalyst = user?.role === "analyst";
  const isElectionUser = !isAdmin && !isAnalyst;
  const isVoter = isElectionUser;
  const isCandidateAccount = user?.role === "candidate";

  const { data: candidateEntries } = useQuery({
    queryKey: [api.candidates.mine.path, "nav"],
    queryFn: async () => {
      const res = await fetch(api.candidates.mine.path);
      if (!res.ok) throw new Error("Failed to fetch candidate entries");
      return api.candidates.mine.responses[200].parse(await res.json());
    },
    enabled: !!user && isElectionUser,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const hasCandidateDashboard = isCandidateAccount || (candidateEntries?.length ?? 0) > 0;
  const dashboardHref = isAdmin
    ? "/admin/dashboard"
    : isAnalyst
      ? "/analytics"
      : hasCandidateDashboard
        ? "/candidate-dashboard"
        : "/dashboard";
  const roleLabel = isAdmin ? "Admin" : isAnalyst ? "Analyst" : isCandidateAccount ? "Candidate" : "Voter";

  if (!user) return <>{children}</>;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
            <Link href={dashboardHref} className="flex items-center gap-2 font-display text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
            <Vote className="h-8 w-8" />
            <span>Votely</span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link href={dashboardHref} className={`text-sm font-medium transition-colors hover:text-primary ${location.includes("dashboard") ? "text-primary" : "text-muted-foreground"}`}>
              Dashboard
            </Link>
            {isAdmin && (
              <Link href="/admin/create-election" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/admin/create-election" ? "text-primary" : "text-muted-foreground"}`}>
                Create Election
              </Link>
            )}
            {isAdmin && (
              <Link href="/analytics" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/analytics" ? "text-primary" : "text-muted-foreground"}`}>
                Live Analytics
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/parties" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/admin/parties" ? "text-primary" : "text-muted-foreground"}`}>
                Parties
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin/stress-monitor" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/admin/stress-monitor" ? "text-primary" : "text-muted-foreground"}`}>
                Stress Monitor
              </Link>
            )}
            {isVoter && (
              <>
                <Link href="/elections" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/elections" ? "text-primary" : "text-muted-foreground"}`}>
                  Elections
                </Link>
                <Link href={hasCandidateDashboard ? "/candidate-dashboard" : "/apply-candidate"} className={`text-sm font-medium transition-colors hover:text-primary ${location === "/candidate-dashboard" || location === "/apply-candidate" ? "text-primary" : "text-muted-foreground"}`}>
                  {hasCandidateDashboard ? "Candidate" : "Apply as Candidate"}
                </Link>
                <Link href="/my-votes" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/my-votes" ? "text-primary" : "text-muted-foreground"}`}>
                  My Votes
                </Link>
                <Link href="/analytics" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/analytics" ? "text-primary" : "text-muted-foreground"}`}>
                  Live Analytics
                </Link>
              </>
            )}
            {isAnalyst && (
              <Link href="/analytics" className={`text-sm font-medium transition-colors hover:text-primary ${location === "/analytics" ? "text-primary" : "text-muted-foreground"}`}>
                Live Analytics
              </Link>
            )}
          </nav>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">{roleLabel}</span>
            </div>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card text-card-foreground border border-border shadow-lg">
                <DropdownMenuLabel>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium leading-none">{user.name}</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">{roleLabel}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAdmin ? (
                  <>
                    <Link href="/profile">
                      <DropdownMenuItem className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile Settings</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <Link href="/admin/dashboard">
                      <DropdownMenuItem className="cursor-pointer">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>Manage Elections</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/candidates">
                      <DropdownMenuItem className="cursor-pointer">
                        <Users className="mr-2 h-4 w-4" />
                        <span>Manage Candidates</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/voters">
                      <DropdownMenuItem className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>Manage Voters</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/parties">
                      <DropdownMenuItem className="cursor-pointer">
                        <Flag className="mr-2 h-4 w-4" />
                        <span>Manage Parties</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/analytics">
                      <DropdownMenuItem className="cursor-pointer">
                        <BarChart3 className="mr-2 h-4 w-4" />
                        <span>Live Analytics</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/audit-logs">
                      <DropdownMenuItem className="cursor-pointer">
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        <span>Audit Trail</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/admin/stress-monitor">
                      <DropdownMenuItem className="cursor-pointer">
                        <Activity className="mr-2 h-4 w-4" />
                        <span>Stress Monitor</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                  </>
                ) : isAnalyst ? (
                  <>
                    <Link href="/profile">
                      <DropdownMenuItem className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile Settings</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <Link href="/analytics">
                      <DropdownMenuItem className="cursor-pointer">
                        <BarChart3 className="mr-2 h-4 w-4" />
                        <span>Live Analytics</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                  </>
                ) : (
                  <>
                    <Link href="/profile">
                      <DropdownMenuItem className="cursor-pointer">
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile Settings</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                    <Link href={dashboardHref}>
                      <DropdownMenuItem className="cursor-pointer">
                        <LayoutDashboard className="mr-2 h-4 w-4" />
                        <span>My Dashboard</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/elections">
                      <DropdownMenuItem className="cursor-pointer">
                        <ListChecks className="mr-2 h-4 w-4" />
                        <span>Elections</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/my-votes">
                      <DropdownMenuItem className="cursor-pointer">
                        <Vote className="mr-2 h-4 w-4" />
                        <span>My Votes</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href={hasCandidateDashboard ? "/candidate-dashboard" : "/apply-candidate"}>
                      <DropdownMenuItem className="cursor-pointer">
                        <Trophy className="mr-2 h-4 w-4" />
                        <span>{hasCandidateDashboard ? "Candidate Dashboard" : "Apply as Candidate"}</span>
                      </DropdownMenuItem>
                    </Link>
                    <Link href="/analytics">
                      <DropdownMenuItem className="cursor-pointer">
                        <BarChart3 className="mr-2 h-4 w-4" />
                        <span>Live Analytics</span>
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem onClick={() => logout()} className="text-destructive cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  );
}


