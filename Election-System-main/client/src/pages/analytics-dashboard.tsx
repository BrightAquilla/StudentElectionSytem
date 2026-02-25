import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@shared/routes";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2, Activity, BarChart3, TrendingUp, Users, Vote } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
  Legend,
} from "recharts";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

type ProceedingsData = z.infer<typeof api.analytics.proceedings.responses[200]>;
type PositionSection = ProceedingsData["byPosition"][number];
type CandidateSection = PositionSection["candidates"][number];

export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error, refetch } = useQuery<ProceedingsData>({
    queryKey: [api.analytics.proceedings.path],
    queryFn: async () => {
      const res = await fetch(api.analytics.proceedings.path);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message || "Failed to fetch analytics");
      }
      const raw = await res.json();
      const parsed = api.analytics.proceedings.responses[200].safeParse(raw);
      if (parsed.success) return parsed.data;

      // Soft normalization fallback to keep dashboard usable when legacy rows contain nulls.
      return {
        totals: {
          totalVoters: Number(raw?.totals?.totalVoters ?? 0),
          totalElections: Number(raw?.totals?.totalElections ?? 0),
          totalVotesCast: Number(raw?.totals?.totalVotesCast ?? 0),
          activeElections: Number(raw?.totals?.activeElections ?? 0),
        },
        byPosition: Array.isArray(raw?.byPosition) ? raw.byPosition.map((section: any) => ({
          position: String(section?.position ?? "Unassigned"),
          electionId: Number(section?.electionId ?? 0),
          electionTitle: String(section?.electionTitle ?? "Untitled Election"),
          status: String(section?.status ?? "Inactive"),
          totalVotes: Number(section?.totalVotes ?? 0),
          candidates: Array.isArray(section?.candidates) ? section.candidates.map((candidate: any) => ({
            candidateId: Number(candidate?.candidateId ?? 0),
            candidateName: String(candidate?.candidateName ?? "Candidate"),
            voteCount: Number(candidate?.voteCount ?? 0),
            party: candidate?.party ?? null,
            symbol: candidate?.symbol ?? null,
            color: String(candidate?.color ?? "#2563eb"),
          })) : [],
        })) : [],
        votesByElection: Array.isArray(raw?.votesByElection) ? raw.votesByElection.map((entry: any) => ({
          electionId: Number(entry?.electionId ?? 0),
          electionTitle: String(entry?.electionTitle ?? "Untitled Election"),
          position: String(entry?.position ?? "Unassigned"),
          status: String(entry?.status ?? "Inactive"),
          votes: Number(entry?.votes ?? 0),
        })) : [],
        turnoutTimeline: Array.isArray(raw?.turnoutTimeline) ? raw.turnoutTimeline.map((entry: any) => ({
          bucket: String(entry?.bucket ?? ""),
          votes: Number(entry?.votes ?? 0),
        })) : [],
        turnoutByPhase: Array.isArray(raw?.turnoutByPhase) ? raw.turnoutByPhase.map((entry: any) => ({
          phase: String(entry?.phase ?? ""),
          votes: Number(entry?.votes ?? 0),
        })) : [],
      };
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const [selectedPosition, setSelectedPosition] = useState<string>("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date>(new Date());
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);

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
          setLastUpdatedAt(new Date());
          refetch();
        }
      } catch {
        // no-op
      }
    };
    return () => ws.close();
  }, [refetch]);

  useEffect(() => {
    if (!selectedPosition && data?.byPosition?.length) {
      setSelectedPosition(data.byPosition[0].position);
    }
  }, [data, selectedPosition]);

  useEffect(() => {
    if (data) {
      setLastUpdatedAt(new Date());
    }
  }, [data]);

  const selected = useMemo(() => {
    if (!data?.byPosition?.length) return null;
    return data.byPosition.find((p: PositionSection) => p.position === selectedPosition) || data.byPosition[0];
  }, [data, selectedPosition]);

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    const message = error instanceof Error ? error.message : "Unknown analytics error";
    return (
      <Card>
        <CardContent className="p-8 text-center space-y-3">
          <p className="text-destructive font-semibold">Failed to load analytics dashboard.</p>
          <p className="text-sm text-muted-foreground">{message}</p>
          <Button variant="outline" onClick={() => refetch()}>Retry loading analytics</Button>
        </CardContent>
      </Card>
    );
  }

  const totals = data.totals;
  const isPrivileged = !!user && (user.isAdmin || user.role === "analyst");
  const votersHref = isPrivileged ? "/admin/voters" : "/dashboard";
  const votesHref = isPrivileged ? "/admin/analytics" : "/my-votes";
  const electionsHref = isPrivileged ? "/admin/elections" : "/elections";
  const turnoutRate = totals.totalVoters > 0 ? (totals.totalVotesCast / totals.totalVoters) * 100 : 0;
  const candidateData = selected?.candidates ?? [];
  const sortedCandidates = [...candidateData].sort((a, b) => b.voteCount - a.voteCount);
  const leader = sortedCandidates[0];
  const runnerUp = sortedCandidates[1];
  const leadMargin = leader ? leader.voteCount - (runnerUp?.voteCount ?? 0) : 0;
  const hasVotes = candidateData.some((candidate: CandidateSection) => candidate.voteCount > 0);

  const pieData = candidateData.map((candidate: CandidateSection) => ({
    ...candidate,
    chartValue: hasVotes ? candidate.voteCount : 1,
    voteShare: selected?.totalVotes ? (candidate.voteCount / selected.totalVotes) * 100 : 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">Election Analyst Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Real-time election intelligence by position with comparative candidate analytics.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={isLiveConnected ? "default" : "secondary"} className="text-xs">
            {isLiveConnected ? "Live connected" : "Reconnecting live feed"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            Last update: {lastUpdatedAt.toLocaleTimeString()}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {isPrivileged ? (
          <Link href={votersHref}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-5 flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div><p className="text-xs text-muted-foreground">Registered Voters</p><p className="text-2xl font-bold">{totals.totalVoters}</p></div>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Link href={electionsHref}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-5 flex items-center gap-3">
                <Users className="h-5 w-5 text-primary" />
                <div><p className="text-xs text-muted-foreground">Visible Positions</p><p className="text-2xl font-bold">{data.byPosition.length}</p></div>
              </CardContent>
            </Card>
          </Link>
        )}
        <Link href={votesHref}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center gap-3">
              <Vote className="h-5 w-5 text-primary" />
              <div><p className="text-xs text-muted-foreground">Voters Participated</p><p className="text-2xl font-bold">{totals.totalVotesCast}</p></div>
            </CardContent>
          </Card>
        </Link>
        <Link href={electionsHref}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center gap-3">
              <BarChart3 className="h-5 w-5 text-primary" />
              <div><p className="text-xs text-muted-foreground">Total Elections</p><p className="text-2xl font-bold">{totals.totalElections}</p></div>
            </CardContent>
          </Card>
        </Link>
        <Link href={electionsHref}>
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-5 flex items-center gap-3">
              <Activity className="h-5 w-5 text-primary" />
              <div><p className="text-xs text-muted-foreground">Active Elections</p><p className="text-2xl font-bold">{totals.activeElections}</p></div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {isPrivileged && (
        <Card>
          <CardHeader>
            <CardTitle>Turnout Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Voter participation</span>
              <span className="font-semibold">{formatPercent(turnoutRate)}</span>
            </div>
            <Progress value={Math.min(turnoutRate, 100)} />
            <p className="text-xs text-muted-foreground">
              {totals.totalVotesCast} voters participated out of {totals.totalVoters} registered voters.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Position Switcher</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {data.byPosition.map((position: PositionSection) => (
              <button
                key={position.position}
                type="button"
                className={`rounded-md px-3 py-2 text-sm border transition-colors ${
                  selected?.position === position.position
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-input hover:bg-muted"
                }`}
                onClick={() => setSelectedPosition(position.position)}
              >
                {position.position}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected ? (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle>{selected.position}</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">{selected.electionTitle}</p>
                <p className="text-muted-foreground">Status: {selected.status}</p>
                <p className="text-muted-foreground">Total Votes: {selected.totalVotes}</p>
                <p className="text-muted-foreground">Candidates: {selected.candidates.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Current Leader</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">{leader?.candidateName ?? "No leader yet"}</p>
                <p className="text-muted-foreground">Votes: {leader?.voteCount ?? 0}</p>
                <p className="text-muted-foreground">Party: {leader?.party || "Independent"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Lead Margin</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-semibold text-foreground">{leadMargin} votes</p>
                <p className="text-muted-foreground">
                  {runnerUp ? `${leader?.candidateName} ahead of ${runnerUp.candidateName}` : "Waiting for more candidates"}
                </p>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <TrendingUp className="h-4 w-4" />
                  <span>Competitive signal for this position</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Votes per Candidate</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={candidateData} margin={{ top: 8, right: 10, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="candidateName" angle={-20} textAnchor="end" height={80} />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="voteCount" radius={[6, 6, 0, 0]}>
                      {candidateData.map((candidate: CandidateSection) => (
                        <Cell key={candidate.candidateId} fill={candidate.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Candidate Share</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={pieData} dataKey="chartValue" nameKey="candidateName" outerRadius={110}>
                      {pieData.map((candidate: CandidateSection & { chartValue: number; voteShare: number }) => (
                        <Cell key={candidate.candidateId} fill={candidate.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(_value, _name, entry: { payload?: { candidateName?: string; voteCount?: number } }) => [`${entry?.payload?.voteCount ?? 0} votes`, entry?.payload?.candidateName ?? "Candidate"]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 flex flex-wrap gap-3">
                  {pieData.map((candidate: CandidateSection & { chartValue: number; voteShare: number }) => (
                    <div key={`pie-legend-${candidate.candidateId}`} className="inline-flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: candidate.color }}
                      />
                      <span className="text-foreground">{candidate.candidateName}</span>
                    </div>
                  ))}
                </div>
                {!hasVotes && (
                  <p className="text-xs text-muted-foreground mt-2">
                    No votes yet: chart is intentionally balanced to keep each candidate equally visible.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardHeader><CardTitle>Overall Turnout Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.turnoutTimeline} margin={{ top: 8, right: 10, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Line type="monotone" dataKey="votes" stroke="#2563eb" strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Vote Distribution by Phase</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.turnoutByPhase}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="phase" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="votes" radius={[6, 6, 0, 0]} fill="#0f766e" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Votes Cast per Election</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.votesByElection} margin={{ top: 8, right: 10, left: 0, bottom: 50 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="electionTitle" angle={-20} textAnchor="end" height={90} />
                  <YAxis allowDecimals={false} />
                  <Tooltip formatter={(value, _name, payload: any) => [`${value} votes`, `${payload?.payload?.position || "Election"}`]} />
                  <Bar dataKey="votes" radius={[6, 6, 0, 0]} fill="#334155" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Candidate Comparison and Color Legend</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedCandidates.map((candidate) => {
                  const voteShare = selected.totalVotes > 0 ? (candidate.voteCount / selected.totalVotes) * 100 : 0;
                  const photoSrc = typeof candidate.symbol === "string" && candidate.symbol.startsWith("__img__")
                    ? candidate.symbol.slice(7)
                    : null;
                  return (
                    <div key={candidate.candidateId} className="rounded-lg border p-3">
                      <div className="flex items-center gap-3 text-sm mb-2">
                        <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: candidate.color }} />
                        {photoSrc ? (
                          <img src={photoSrc} alt={candidate.candidateName} className="h-8 w-8 rounded-full object-cover border" />
                        ) : (
                          <span className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center text-[10px] text-muted-foreground">N/A</span>
                        )}
                        <span className="font-medium">{candidate.candidateName}</span>
                        <span className="text-muted-foreground">{candidate.party || "Independent"}</span>
                        <span className="ml-auto text-muted-foreground">{candidate.voteCount} votes ({formatPercent(voteShare)})</span>
                      </div>
                      <Progress value={Math.min(voteShare, 100)} />
                    </div>
                  );
                })}
                {sortedCandidates.length === 0 && (
                  <p className="text-sm text-muted-foreground">No candidates available for this position yet.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Candidate Vote Trend (Position View)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={candidateData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="candidateName" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  {candidateData.map((candidate: CandidateSection) => (
                    <Line
                      key={candidate.candidateId}
                      type="monotone"
                      name={candidate.candidateName}
                      dataKey="voteCount"
                      stroke={candidate.color}
                      strokeWidth={2}
                      dot={{ r: 4, fill: candidate.color }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card><CardContent className="p-8 text-muted-foreground text-center">No position analytics available yet.</CardContent></Card>
      )}
    </div>
  );
}
