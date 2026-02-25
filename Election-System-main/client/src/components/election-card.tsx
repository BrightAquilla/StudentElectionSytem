import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, ChevronRight, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import type { ElectionWithCandidates } from "@shared/schema";

interface ElectionCardProps {
  election: Partial<ElectionWithCandidates>;
  isAdmin?: boolean;
}

export function ElectionCard({ election, isAdmin = false }: ElectionCardProps) {
  const now = new Date();
  const startDate = new Date(election.startDate!);
  const endDate = new Date(election.endDate!);
  
  const isPublished = election.isPublished !== false; // Default to true if not specified
  const isActive = now >= startDate && now <= endDate;
  const isUpcoming = now < startDate;
  const isEnded = now > endDate;

  // Determine badge color based on publication and time status
  let badgeColor = "secondary";
  let badgeText = "Inactive";
  
  if (!isPublished) {
    badgeText = "Inactive";
    badgeColor = "secondary";
  } else if (isEnded) {
    badgeText = "Ended";
    badgeColor = "secondary";
  } else if (isActive) {
    badgeText = "Active";
    badgeColor = "default";
  } else if (isUpcoming) {
    badgeText = "Upcoming";
    badgeColor = "secondary";
  }

  const endedCardStyle = isEnded
    ? "opacity-80 saturate-50 border-dashed"
    : "";

  return (
    <Card className={`group hover:shadow-lg transition-all duration-300 border-border/50 bg-card overflow-hidden flex flex-col h-full ${endedCardStyle}`}>
      <div className={`h-2 w-full ${isPublished && isActive ? 'bg-green-500' : isPublished && isUpcoming ? 'bg-blue-500' : 'bg-gray-300'}`} />
      
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start gap-4">
          <Badge 
            variant={badgeColor === "default" ? "default" : "secondary"} 
            className={badgeColor === "default" ? "bg-green-500 hover:bg-green-600" : ""}
          >
            {badgeText}
          </Badge>
          {election.hasVoted && (
            <Badge variant="outline" className="text-primary border-primary gap-1">
              <CheckCircle2 className="w-3 h-3" /> Already Voted
            </Badge>
          )}
        </div>
        <CardTitle className="text-xl font-bold leading-tight mt-2 line-clamp-2">
          {election.title}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="flex-1">
        <p className="text-muted-foreground text-sm mb-6 line-clamp-3">
          {election.description || "No description provided."}
        </p>
        
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span>Starts: {format(new Date(election.startDate!), "PPp")}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-destructive" />
            <span>Ends: {format(new Date(election.endDate!), "PPp")}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="pt-4 border-t bg-muted/20">
        {isAdmin ? (
          <Link href={`/admin/elections/${election.id}`} className="w-full">
            <Button className="w-full" variant="outline">
              Manage Election <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        ) : (
          <div className="w-full space-y-2">
            {isEnded ? (
              <Link href={`/elections/${election.id}/results`} className="w-full">
                <Button className="w-full" variant="default">
                  View Results
                </Button>
              </Link>
            ) : isPublished && isActive ? (
              <div className="flex gap-2">
                {election.hasVoted ? (
                  <Link href="/my-votes" className="w-full">
                    <Button className="w-full" variant="default">
                      View My Votes
                    </Button>
                  </Link>
                ) : (
                  <>
                    <Link href={`/elections/${election.id}`} className="flex-1">
                      <Button className="w-full" variant="default">
                        Vote Now
                      </Button>
                    </Link>
                    <Link href={`/elections/${election.id}`} className="flex-1">
                      <Button className="w-full" variant="outline">
                        View Candidates
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            ) : isPublished && isUpcoming ? (
              <div className="flex gap-2">
                <Link href={`/elections/${election.id}`} className="flex-1">
                  <Button className="w-full" variant="outline">
                    View Candidates
                  </Button>
                </Link>
                <Link href={`/apply-candidate?electionId=${election.id}`} className="flex-1">
                  <Button className="w-full" variant="default">
                    Apply as Candidate
                  </Button>
                </Link>
              </div>
            ) : !isPublished ? (
              <Button disabled variant="outline" className="w-full">
                Election Inactive
              </Button>
            ) : (
              <Link href={`/elections/${election.id}`} className="w-full">
                <Button className="w-full" variant="outline">
                  View Details
                </Button>
              </Link>
            )}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
