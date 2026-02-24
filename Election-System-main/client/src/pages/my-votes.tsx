import { useElections } from "@/hooks/use-elections";
import { ElectionCard } from "@/components/election-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Loader2, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

export default function MyVotes() {
  const { data: elections, isLoading, error, refetch } = useElections();

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-2xl font-bold text-foreground">Something went wrong</h2>
        <p className="text-muted-foreground">Failed to load your voting history. Please try again.</p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  const now = new Date();

  // Show ALL elections where the user has voted (active, past, upcoming)
  const votedElections = (elections ?? []).filter((e: any) => e.hasVoted);

  // Split by status for better organization
  const activeVoted = votedElections.filter(
    (e) => new Date(e.startDate) <= now && now <= new Date(e.endDate)
  );
  const pastVoted = votedElections.filter((e) => now > new Date(e.endDate));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">My Voting History</h1>
          <p className="text-muted-foreground mt-1">
            All elections you've participated in.
          </p>
        </div>
        {votedElections.length > 0 && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-full text-sm font-medium">
            <CheckCircle2 className="h-4 w-4" />
            {votedElections.length} vote{votedElections.length !== 1 ? "s" : ""} cast
          </div>
        )}
      </div>

      {votedElections.length === 0 ? (
        <Card className="bg-muted/20 border-dashed">
          <CardContent className="p-12 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Votes Yet</h3>
            <p className="text-muted-foreground mb-6">
              You haven't participated in any elections yet. Check the active elections to get started.
            </p>
            <Link href="/dashboard">
              <Button size="lg">View Elections</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-10">
          {activeVoted.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                Active Elections
                <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-sans">
                  {activeVoted.length} Live
                </span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeVoted.map((election) => (
                  <ElectionCard key={election.id} election={election} />
                ))}
              </div>
            </section>
          )}

          {pastVoted.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-4 text-muted-foreground">Past Elections</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pastVoted.map((election) => (
                  <ElectionCard key={election.id} election={election} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
