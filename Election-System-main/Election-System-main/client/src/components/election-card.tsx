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
  const isActive = new Date() >= new Date(election.startDate!) && new Date() <= new Date(election.endDate!);
  const isUpcoming = new Date() < new Date(election.startDate!);
  const isEnded = new Date() > new Date(election.endDate!);

  return (
    <Card className="group hover:shadow-lg transition-all duration-300 border-border/50 bg-card overflow-hidden flex flex-col h-full">
      <div className={`h-2 w-full ${isActive ? 'bg-green-500' : isUpcoming ? 'bg-blue-500' : 'bg-gray-300'}`} />
      
      <CardHeader className="pb-4">
        <div className="flex justify-between items-start gap-4">
          <Badge variant={isActive ? "default" : "secondary"} className={isActive ? "bg-green-500 hover:bg-green-600" : ""}>
            {isActive ? "Active" : isUpcoming ? "Upcoming" : "Ended"}
          </Badge>
          {election.hasVoted && (
            <Badge variant="outline" className="text-primary border-primary gap-1">
              <CheckCircle2 className="w-3 h-3" /> Voted
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
          <Link href={`/elections/${election.id}`} className="w-full">
            <Button 
              className="w-full" 
              disabled={!isActive || election.hasVoted}
              variant={election.hasVoted ? "secondary" : "default"}
            >
              {election.hasVoted ? "View Details" : isActive ? "Vote Now" : "View Details"}
            </Button>
          </Link>
        )}
      </CardFooter>
    </Card>
  );
}
