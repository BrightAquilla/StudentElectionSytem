import { useElection, useElectionResults } from "@/hooks/use-elections";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Award, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

const COLORS = [
  "#8b5cf6", // purple
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
];

export default function ElectionResults() {
  const { id } = useParams();
  const electionId = Number(id);
  const { data: election, isLoading: electionLoading } = useElection(electionId);
  const { data: results, isLoading: resultsLoading, error } = useElectionResults(electionId, { refetchInterval: 5000 });

  if (electionLoading || resultsLoading) {
    return <div className="p-8"><Skeleton className="h-[400px] w-full rounded-xl" /></div>;
  }

  if (error || !election || !results) {
    return <div className="p-8 text-center text-red-500">Failed to load results.</div>;
  }

  const chartData = results.candidates.map((candidate: any) => ({
    name: candidate.name,
    votes: candidate.voteCount,
  }));

  const leadingCandidate = results.candidates.length > 0
    ? results.candidates.reduce((prev: any, current: any) =>
        current.voteCount > prev.voteCount ? current : prev
      )
    : null;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <Link href="/elections" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Elections
      </Link>

      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-4xl font-display font-bold text-foreground">{election.title}</h1>
          <Badge className="bg-green-500 hover:bg-green-600">
            Results
          </Badge>
        </div>

        <p className="text-lg text-muted-foreground leading-relaxed">{election.description}</p>

        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground border-y py-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">Ended:</span> {format(new Date(election.endDate), "PPP p")}
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Total Votes:</span> <strong>{results.totalVotes}</strong>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" /> Total Votes Cast
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-primary">{results.totalVotes}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="w-5 h-5" /> Candidates
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold text-primary">{results.candidates.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      {chartData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Vote Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="votes" radius={[8, 8, 0, 0]}>
                  {chartData.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : null}

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle>Results</CardTitle>
        </CardHeader>
        <CardContent>
          {results.candidates.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No votes were cast in this election.
            </div>
          ) : (
            <div className="space-y-3">
              {results.candidates
                .sort((a: any, b: any) => b.voteCount - a.voteCount)
                .map((candidate: any, index: number) => {
                  const percentage =
                    results.totalVotes > 0
                      ? ((candidate.voteCount / results.totalVotes) * 100).toFixed(1)
                      : "0";

                  return (
                    <div
                      key={candidate.id}
                      className={`flex items-center gap-4 p-4 rounded-lg border transition-all ${
                        index === 0
                          ? "bg-amber-50 border-amber-200"
                          : "bg-muted/30 border-border/50 hover:bg-muted/50"
                      }`}
                    >
                      {/* Candidate Symbol/Image */}
                      <div className="flex-shrink-0">
                        {typeof candidate.symbol === "string" && candidate.symbol.startsWith("__img__") ? (
                          <img
                            src={candidate.symbol.replace("__img__", "")}
                            alt="Candidate photo"
                            className="h-14 w-14 rounded-full object-cover border-2 border-primary/20"
                          />
                        ) : candidate.photo && candidate.photo.startsWith('data:image/') ? (
                          <img
                            src={candidate.photo}
                            alt="Candidate photo"
                            className="h-14 w-14 rounded-full object-cover border-2 border-primary/20"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            👤
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-lg">{candidate.name}</span>
                          {index === 0 && (
                            <Badge className="bg-amber-500 hover:bg-amber-600">
                              <Award className="w-3 h-3 mr-1" /> Leading
                            </Badge>
                          )}
                        </div>
                        {candidate.party && (
                          <div className="text-xs text-muted-foreground mb-1">
                            <strong>Party / Affiliation:</strong> {candidate.party}
                          </div>
                        )}
                        {candidate.position && (
                          <div className="text-xs text-muted-foreground mb-1">
                            <strong>Position Vying For:</strong> {candidate.position}
                          </div>
                        )}
                        {candidate.manifesto && (
                          <div className="text-xs text-muted-foreground mb-1">
                            <strong>Platform / Manifesto:</strong> {candidate.manifesto}
                          </div>
                        )}
                        {/* Progress bar */}
                        <div className="mt-2 w-full bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-primary h-full rounded-full transition-all"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">{candidate.voteCount}</p>
                        <p className="text-xs text-muted-foreground">{percentage}%</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
