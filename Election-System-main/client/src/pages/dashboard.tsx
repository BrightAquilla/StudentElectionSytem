import { useElections } from "@/hooks/use-elections";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { ElectionCard } from "@/components/election-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertCircle, CheckSquare, Clock, History, List, RefreshCw, Trophy } from "lucide-react";

export default function Dashboard() {
  const { data: elections, isLoading, error, refetch } = useElections();
  const { data: proceedings } = useQuery({
    queryKey: [api.analytics.proceedings.path, "voter-dashboard"],
    queryFn: async () => {
      const res = await fetch(api.analytics.proceedings.path);
      if (!res.ok) throw new Error("Failed to load analytics");
      return api.analytics.proceedings.responses[200].parse(await res.json());
    },
    retry: 1,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const { user } = useAuth();

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="h-10 w-48 bg-muted rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-[300px] rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-2xl font-bold text-foreground">Something went wrong</h2>
        <p className="text-muted-foreground">Failed to load elections. Please try again.</p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  const now = new Date();
  const allElections = elections ?? [];
  const activeElections = allElections.filter(
    (e) => new Date(e.startDate) <= now && now <= new Date(e.endDate)
  );
  const upcomingElections = allElections.filter((e) => now < new Date(e.startDate));
  const pastElections = allElections.filter((e) => now > new Date(e.endDate));

  // hasVoted is augmented by the server for non-admin users
  const votedElections = allElections.filter((e: any) => e.hasVoted);
  const votesCast = votedElections.length;
  const pastVotedElections = pastElections.filter((e: any) => e.hasVoted);
  const racePulse = (proceedings?.byPosition ?? []).slice(0, 6);

  return (
    <div className="space-y-12">
      {/* Greeting */}
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">
          Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with elections.</p>
      </div>

      {/* Top Stats */}
      <section className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <CheckSquare className="h-4 w-4" /> Ongoing Elections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeElections.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {activeElections.filter((e: any) => !e.hasVoted).length} awaiting your vote
              </p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <List className="h-4 w-4" /> Votes Cast
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{votesCast}</div>
              <p className="text-xs text-muted-foreground mt-1">across all elections</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" /> Upcoming Elections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingElections.length}</div>
              <p className="text-xs text-muted-foreground mt-1">scheduled soon</p>
            </CardContent>
          </Card>

          <Card className="bg-muted/30">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                <History className="h-4 w-4" /> Past Elections
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pastElections.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                voted in {pastVotedElections.length}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <Card className="bg-muted/20">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">Vote Now</h3>
                <p className="text-muted-foreground text-sm">
                  {activeElections.filter((e: any) => !e.hasVoted).length > 0
                    ? `${activeElections.filter((e: any) => !e.hasVoted).length} election(s) need your vote`
                    : "No pending votes"}
                </p>
              </div>
              <Link href="/elections">
                <Button size="lg" variant="default">View Elections</Button>
              </Link>
            </CardContent>
          </Card>
          <Card className="bg-muted/20">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">My Voting History</h3>
                <p className="text-muted-foreground text-sm">
                  {votesCast > 0 ? `You've voted in ${votesCast} election(s)` : "No votes yet"}
                </p>
              </div>
              <Link href="/my-votes">
                <Button size="lg" variant="outline">View History</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-display font-bold">Live Race Pulse</h2>
          <Link href="/analytics">
            <Button variant="outline">Open Analyst View</Button>
          </Link>
        </div>
        {racePulse.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {racePulse.map((position) => {
              const sorted = [...position.candidates].sort((a, b) => b.voteCount - a.voteCount);
              const leader = sorted[0];
              const share = position.totalVotes > 0 && leader ? (leader.voteCount / position.totalVotes) * 100 : 0;
              return (
                <Card key={position.position} className="bg-muted/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{position.position}</CardTitle>
                    <p className="text-xs text-muted-foreground">{position.status} | {position.totalVotes} votes cast</p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Trophy className="h-4 w-4 text-amber-500" />
                      <span className="font-medium">{leader?.candidateName ?? "No leader yet"}</span>
                    </div>
                    <Progress value={Math.min(share, 100)} />
                    <p className="text-xs text-muted-foreground">
                      {leader ? `${share.toFixed(1)}% share of position votes` : "Waiting for votes"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="bg-muted/20">
            <CardContent className="p-6 text-sm text-muted-foreground">
              Analyst data is being prepared. Check back after seed setup or live voting activity.
            </CardContent>
          </Card>
        )}
      </section>

      {/* Active Elections */}
      <section id="active-elections">
        <h2 className="text-3xl font-display font-bold mb-6 flex items-center gap-3">
          Active Elections
          <span className="bg-green-100 text-green-700 text-sm px-3 py-1 rounded-full font-sans font-medium">
            {activeElections.length} Live
          </span>
        </h2>
        {activeElections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeElections.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        ) : (
          <div className="bg-muted/30 rounded-xl p-12 text-center border border-dashed border-muted-foreground/25">
            <p className="text-muted-foreground">No active elections at the moment.</p>
          </div>
        )}
      </section>

      {/* Upcoming Elections */}
      {upcomingElections.length > 0 && (
        <section>
          <h2 className="text-2xl font-display font-bold mb-6 text-muted-foreground">Upcoming</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {upcomingElections.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        </section>
      )}

      
    </div>
  );
}
