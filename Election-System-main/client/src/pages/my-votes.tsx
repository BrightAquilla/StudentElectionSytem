import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import { api } from "@shared/routes";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, Trophy, CalendarClock, Vote } from "lucide-react";

type MyVoteEntry = {
  voteId: number;
  votedAt: string;
  electionId: number;
  electionTitle: string;
  electionPosition: string;
  electionStatus: string;
  electionStartDate: string;
  electionEndDate: string;
  electionProgressPercent: number;
  totalVotes: number;
  myCandidate: {
    candidateId: number;
    candidateName: string;
    party: string | null;
    voteCount: number;
    rank: number;
  };
  leader: {
    candidateId: number;
    candidateName: string;
    party: string | null;
    voteCount: number;
  } | null;
};

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "Active") return "default";
  if (status === "Ended") return "secondary";
  if (status === "Upcoming") return "outline";
  return "destructive";
}

export default function MyVotes() {
  const { data, isLoading, error, refetch } = useQuery<MyVoteEntry[]>({
    queryKey: [api.votes.mine.path],
    queryFn: async () => {
      const res = await fetch(api.votes.mine.path);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to load vote history");
      }
      return api.votes.mine.responses[200].parse(await res.json());
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const entries = data ?? [];
  const activeTracked = useMemo(() => entries.filter((entry) => entry.electionStatus === "Active").length, [entries]);
  const leadingCount = useMemo(
    () =>
      entries.filter((entry) => entry.leader && entry.leader.candidateId === entry.myCandidate.candidateId).length,
    [entries],
  );

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.event === "vote_cast") {
          refetch();
        }
      } catch {
        // no-op
      }
    };
    return () => ws.close();
  }, [refetch]);

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-destructive font-semibold">Failed to load your voting history.</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">My Votes and Election Proceedings</h1>
          <p className="text-muted-foreground mt-1">
            Review every vote you cast and track live progress, leaders, and standings per election.
          </p>
        </div>
        <Link href="/analytics">
          <Button variant="outline">Open Full Analyst Dashboard</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total votes cast</p><p className="text-2xl font-bold">{entries.length}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">Active elections tracked</p><p className="text-2xl font-bold">{activeTracked}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-sm text-muted-foreground">My candidates currently leading</p><p className="text-2xl font-bold">{leadingCount}</p></CardContent></Card>
      </div>

      {entries.length === 0 ? (
        <Card className="bg-muted/20 border-dashed">
          <CardContent className="p-10 text-center space-y-3">
            <Vote className="w-10 h-10 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold">No votes recorded yet</h3>
            <p className="text-sm text-muted-foreground">Once you vote in an election, your history and live proceedings will appear here.</p>
            <Link href="/elections">
              <Button>Go to Elections</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const myShare = entry.totalVotes > 0 ? (entry.myCandidate.voteCount / entry.totalVotes) * 100 : 0;
            const leaderShare = entry.totalVotes > 0 && entry.leader ? (entry.leader.voteCount / entry.totalVotes) * 100 : 0;
            const isMyCandidateLeading = entry.leader && entry.leader.candidateId === entry.myCandidate.candidateId;

            return (
              <Card key={entry.voteId}>
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <CardTitle className="text-xl">{entry.electionTitle}</CardTitle>
                    <Badge variant={statusVariant(entry.electionStatus)}>{entry.electionStatus}</Badge>
                  </div>
                  <CardDescription className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Position: {entry.electionPosition} | Voted on {format(new Date(entry.votedAt), "PPP p")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Election timeline progress</span>
                      <span className="font-semibold">{entry.electionProgressPercent}%</span>
                    </div>
                    <Progress value={entry.electionProgressPercent} />
                    <p className="text-xs text-muted-foreground">
                      Runs from {format(new Date(entry.electionStartDate), "PPP p")} to {format(new Date(entry.electionEndDate), "PPP p")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="text-sm text-muted-foreground">Your selected candidate</p>
                      <p className="text-lg font-semibold">{entry.myCandidate.candidateName}</p>
                      <p className="text-sm text-muted-foreground">{entry.myCandidate.party || "Independent"}</p>
                      <p className="text-sm">Votes now: <strong>{entry.myCandidate.voteCount}</strong></p>
                      <p className="text-sm">Current rank: <strong>#{entry.myCandidate.rank}</strong></p>
                      <p className="text-xs text-muted-foreground">Vote share in this election: {myShare.toFixed(1)}%</p>
                    </div>

                    <div className="rounded-lg border p-4 space-y-2">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        Current election leader
                      </p>
                      {entry.leader ? (
                        <>
                          <p className="text-lg font-semibold">{entry.leader.candidateName}</p>
                          <p className="text-sm text-muted-foreground">{entry.leader.party || "Independent"}</p>
                          <p className="text-sm">Votes now: <strong>{entry.leader.voteCount}</strong></p>
                          <p className="text-xs text-muted-foreground">Leader share: {leaderShare.toFixed(1)}%</p>
                          <Badge variant={isMyCandidateLeading ? "default" : "secondary"}>
                            {isMyCandidateLeading ? "You are currently leading" : "Another candidate is leading"}
                          </Badge>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">No leader yet (no votes counted).</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm border-t pt-3">
                    <span className="text-muted-foreground">Total votes counted so far</span>
                    <strong>{entry.totalVotes}</strong>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
