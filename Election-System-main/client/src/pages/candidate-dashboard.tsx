import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Megaphone,
  Sparkles,
  Trophy,
  Vote,
} from "lucide-react";

type CandidateEntry = z.infer<typeof api.candidates.mine.responses[200]>[number];

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "approved") return "default";
  if (status === "pending") return "outline";
  return "destructive";
}

function electionTone(status: string): string {
  if (status === "Active") return "text-emerald-700";
  if (status === "Upcoming") return "text-sky-700";
  if (status === "Ended") return "text-slate-600";
  return "text-amber-700";
}

export default function CandidateDashboard() {
  const { data, isLoading, error, refetch } = useQuery<CandidateEntry[]>({
    queryKey: [api.candidates.mine.path],
    queryFn: async () => {
      const res = await fetch(api.candidates.mine.path);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to load candidate dashboard");
      }
      return api.candidates.mine.responses[200].parse(await res.json());
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const entries = data ?? [];

  const summary = useMemo(() => {
    const approved = entries.filter((entry) => entry.applicationStatus === "approved").length;
    const pending = entries.filter((entry) => entry.applicationStatus === "pending").length;
    const leading = entries.filter((entry) => entry.rank === 1).length;
    const totalVotes = entries.reduce((sum, entry) => sum + entry.voteCount, 0);
    return { approved, pending, leading, totalVotes };
  }, [entries]);

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    const message = error instanceof Error ? error.message : "Unknown candidate dashboard error";
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-destructive font-semibold">Failed to load candidate dashboard.</p>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button variant="outline" onClick={() => refetch()}>Retry</Button>
        </CardContent>
      </Card>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Candidate Campaign Center</h1>
          <p className="text-muted-foreground mt-1">Your campaign dashboard becomes active once you apply for a race.</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="p-10 text-center space-y-4">
            <Megaphone className="w-10 h-10 mx-auto text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-semibold">No active campaign records</p>
              <p className="text-sm text-muted-foreground">
                Apply for an upcoming election to track approval, manifesto, and live standings.
              </p>
            </div>
            <Link href="/apply-candidate">
              <Button>Apply as Candidate</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Candidate Campaign Center</h1>
          <p className="text-muted-foreground mt-1">
            A campaign-first view of approvals, manifesto strength, and live race position.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/apply-candidate">
            <Button variant="outline">Submit New Application</Button>
          </Link>
          <Link href="/analytics">
            <Button>Open Live Analytics</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="border-0 bg-gradient-to-br from-sky-50 to-white">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Approved Campaigns</p>
            <p className="text-3xl font-bold mt-2">{summary.approved}</p>
            <p className="text-sm text-muted-foreground mt-1">Eligible to appear on the ballot.</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-amber-50 to-white">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending Review</p>
            <p className="text-3xl font-bold mt-2">{summary.pending}</p>
            <p className="text-sm text-muted-foreground mt-1">Awaiting admin verification.</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Campaigns Leading</p>
            <p className="text-3xl font-bold mt-2">{summary.leading}</p>
            <p className="text-sm text-muted-foreground mt-1">Current #1 standing in those races.</p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-gradient-to-br from-violet-50 to-white">
          <CardContent className="p-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total Votes Won</p>
            <p className="text-3xl font-bold mt-2">{summary.totalVotes}</p>
            <p className="text-sm text-muted-foreground mt-1">Across all your candidacies.</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        {entries.map((entry) => {
          const voteGap = Math.max(0, entry.leaderVotes - entry.voteCount);
          const chaseProgress = entry.leaderVotes > 0 ? Math.min((entry.voteCount / entry.leaderVotes) * 100, 100) : 0;
          const isLeading = entry.rank === 1;
          const isApproved = entry.applicationStatus === "approved";

          return (
            <Card key={entry.candidateId} className="overflow-hidden">
              <CardHeader className="bg-muted/20 border-b">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1">
                    <CardTitle className="text-2xl">{entry.electionTitle}</CardTitle>
                    <div className="flex gap-2 flex-wrap items-center text-sm">
                      <span className="font-medium">{entry.electionPosition}</span>
                      <span className={electionTone(entry.electionStatus)}>{entry.electionStatus}</span>
                      <span className="text-muted-foreground">{entry.party || "Independent"}</span>
                    </div>
                  </div>
                  <Badge variant={statusVariant(entry.applicationStatus)}>
                    {entry.applicationStatus.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <Card className="border border-border/70 shadow-none">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {isApproved ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}
                        Approval Pipeline
                      </div>
                      <p className="text-lg font-semibold">
                        {isApproved ? "Cleared for the ballot" : entry.applicationStatus === "pending" ? "Awaiting decision" : "Application not approved"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isApproved ? "This campaign is visible to voters and can collect votes." : "Your campaign is not fully active yet."}
                      </p>
                      {entry.reviewNotes && (
                        <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">Admin note:</span> {entry.reviewNotes}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border border-border/70 shadow-none">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Vote className="h-4 w-4 text-primary" />
                        Race Position
                      </div>
                      <p className="text-lg font-semibold">
                        {entry.rank ? `Rank #${entry.rank}` : "No ranking yet"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {isLeading ? "You are currently leading this contest." : `Vote gap to leader: ${voteGap}`}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border border-border/70 shadow-none">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        Competitive Pressure
                      </div>
                      <p className="text-lg font-semibold">
                        {entry.leaderName || "No leader yet"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {entry.leaderVotes > 0 ? `${entry.leaderVotes} leader votes in this race.` : "No votes recorded yet."}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <Card className="border border-border/70 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        Party Message
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm leading-7 text-muted-foreground">
                        {entry.partyManifesto || "No party manifesto submitted for this campaign."}
                      </p>
                    </CardContent>
                  </Card>

                  <Card className="border border-border/70 shadow-none">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Megaphone className="h-4 w-4 text-primary" />
                        Candidate Message
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-sm leading-7 text-muted-foreground">
                        {entry.candidateManifesto || "No candidate manifesto submitted for this campaign."}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <div className="rounded-xl border p-4">
                    <p className="text-sm text-muted-foreground">Votes won</p>
                    <p className="text-2xl font-bold mt-1">{entry.voteCount}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-sm text-muted-foreground">Leader votes</p>
                    <p className="text-2xl font-bold mt-1">{entry.leaderVotes}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-sm text-muted-foreground">Required to draw level</p>
                    <p className="text-2xl font-bold mt-1">{voteGap}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Leader chase progress</span>
                    <span className="font-semibold">
                      {entry.leaderVotes > 0 ? `${chaseProgress.toFixed(1)}%` : "0.0%"}
                    </span>
                  </div>
                  <Progress value={chaseProgress} />
                  {!isLeading && entry.leaderVotes > 0 && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                      <span>You are currently trailing {entry.leaderName} by {voteGap} vote(s).</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
