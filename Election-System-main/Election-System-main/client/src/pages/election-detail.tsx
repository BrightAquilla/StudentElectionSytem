import { useElection, useCastVote } from "@/hooks/use-elections";
import { useParams, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Calendar, CheckCircle2, User } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import type { Candidate } from "@shared/schema";

export default function ElectionDetail() {
  const { id } = useParams();
  const electionId = Number(id);
  const { data: election, isLoading, error } = useElection(electionId);
  const { mutate: castVote, isPending: isVoting } = useCastVote();
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);

  if (isLoading) return <div className="p-8"><Skeleton className="h-[400px] w-full rounded-xl" /></div>;
  if (error || !election) return <div className="p-8 text-center text-red-500">Failed to load election.</div>;

  const isActive = new Date() >= new Date(election.startDate) && new Date() <= new Date(election.endDate);
  const canVote = isActive && !election.hasVoted;

  const handleVote = () => {
    if (selectedCandidate) {
      castVote({ electionId, candidateId: Number(selectedCandidate) });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Link href="/elections" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Elections
      </Link>

      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-4xl font-display font-bold text-foreground">{election.title}</h1>
          {election.hasVoted && (
            <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50">
              <CheckCircle2 className="w-3 h-3 mr-1" /> Voted
            </Badge>
          )}
        </div>

        <p className="text-lg text-muted-foreground leading-relaxed">{election.description}</p>

        <div className="flex flex-wrap gap-6 text-sm text-muted-foreground border-y py-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="font-medium">Starts:</span> {format(new Date(election.startDate), "PPP p")}
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-destructive" />
            <span className="font-medium">Ends:</span> {format(new Date(election.endDate), "PPP p")}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border shadow-sm p-8">
        <h2 className="text-2xl font-bold mb-6">
          Candidates
          <span className="ml-2 text-base font-normal text-muted-foreground">
            ({election.candidates.length} candidates)
          </span>
        </h2>

        {election.candidates.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
            No candidates have been approved for this election yet.
          </div>
        ) : (
          <RadioGroup
            value={selectedCandidate || ""}
            onValueChange={setSelectedCandidate}
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            {election.candidates.map((candidate) => (
              <div key={candidate.id} className="relative">
                <RadioGroupItem
                  value={String(candidate.id)}
                  id={`candidate-${candidate.id}`}
                  className="peer sr-only"
                  disabled={!canVote}
                />
                <Label
                  htmlFor={`candidate-${candidate.id}`}
                  className={`
                    flex flex-col h-full p-6 rounded-xl border-2 cursor-pointer transition-all duration-200
                    hover:bg-muted/30
                    peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5
                    peer-disabled:opacity-50 peer-disabled:cursor-not-allowed
                  `}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                      <User className="w-5 h-5" />
                    </div>
                    <span className="text-lg font-bold">{candidate.name}</span>
                  </div>
                  {/* Show party/symbol if available */}
                  {(candidate.party || candidate.symbol) && (
                    <div className="flex gap-4 text-xs text-muted-foreground mb-2">
                      {candidate.party && (
                        <span><strong>Party:</strong> {candidate.party}</span>
                      )}
                      {candidate.symbol && (
                        <span><strong>Symbol:</strong> {candidate.symbol}</span>
                      )}
                    </div>
                  )}
                  <p className="text-muted-foreground text-sm line-clamp-3">
                    {candidate.platform || "No platform provided."}
                  </p>
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        <div className="mt-8 flex justify-end">
          {!isActive ? (
            <Button disabled variant="outline" size="lg">Election Not Active</Button>
          ) : election.hasVoted ? (
            <Button disabled variant="secondary" size="lg">
              <CheckCircle2 className="mr-2 h-4 w-4" /> You have voted
            </Button>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="lg" disabled={!selectedCandidate || isVoting} className="px-8">
                  {isVoting ? "Submitting..." : "Submit Vote"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm your vote</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to vote for{" "}
                    <strong>
                      {election.candidates.find((c) => String(c.id) === selectedCandidate)?.name}
                    </strong>?
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleVote}>Confirm Vote</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}