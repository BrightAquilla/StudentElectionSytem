import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Eye, ArrowLeft, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Status = "pending" | "approved" | "rejected";

interface CandidateApplication {
  id: number;
  name: string;
  electionId: number;
  electionTitle: string;
  symbol: string | null;
  party: string | null;
  platform: string | null;
  status: string;
  appliedAt: string | null;
  createdAt: string | null;
}

function useCandidates(status: Status) {
  return useQuery<CandidateApplication[]>({
    queryKey: ["/api/candidates", status],
    queryFn: async () => {
      const res = await fetch(`/api/candidates?status=${status}`);
      if (!res.ok) throw new Error("Failed to fetch candidates");
      return res.json();
    },
  });
}

function useUpdateStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: Status }) => {
      const res = await fetch(`/api/candidates/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      toast({ title: "Candidate status updated!" });
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" });
    },
  });
}

function useCandidateCounts() {
  const pending = useCandidates("pending");
  const approved = useCandidates("approved");
  const rejected = useCandidates("rejected");
  return {
    pending: pending.data?.length ?? 0,
    approved: approved.data?.length ?? 0,
    rejected: rejected.data?.length ?? 0,
  };
}

export default function AdminCandidates() {
  const [activeTab, setActiveTab] = useState<Status>("pending");
  const [viewCandidate, setViewCandidate] = useState<CandidateApplication | null>(null);
  const { data: candidates, isLoading } = useCandidates(activeTab);
  const counts = useCandidateCounts();
  const { mutate: updateStatus, isPending } = useUpdateStatus();

  const tabs: { key: Status; label: string }[] = [
    { key: "pending", label: `Pending Applications (${counts.pending})` },
    { key: "approved", label: `Approved Candidates (${counts.approved})` },
    { key: "rejected", label: `Rejected Applications (${counts.rejected})` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Candidate Applications Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Review and manage candidate applications for elections
          </p>
        </div>
      </div>

      {/* Tab Buttons */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2 rounded-md text-sm font-medium transition-colors border ${
              activeTab === tab.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-primary/50"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Section Header */}
      <div>
        <h2 className="text-lg font-bold text-foreground">
          {activeTab === "pending" && "Candidate Applications Awaiting Review"}
          {activeTab === "approved" && "Approved Candidates"}
          {activeTab === "rejected" && "Rejected Applications"}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {activeTab === "pending" && "Review and approve/reject new candidate applications from voters"}
          {activeTab === "approved" && "These candidates are visible to voters and can receive votes"}
          {activeTab === "rejected" && "These applications were not approved"}
        </p>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !candidates || candidates.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-xl text-muted-foreground">
          <UserPlus className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No {activeTab} applications</p>
          <p className="text-sm mt-1">
            {activeTab === "pending" ? "All applications have been reviewed." : `No ${activeTab} candidates yet.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {candidates.map((candidate) => (
            <Card
              key={candidate.id}
              className={`border-l-4 ${
                activeTab === "pending"
                  ? "border-l-yellow-400"
                  : activeTab === "approved"
                  ? "border-l-green-500"
                  : "border-l-red-400"
              }`}
            >
              <CardContent className="p-5 space-y-4">
                {/* Name + Status Badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-lg leading-tight">{candidate.name}</h3>
                    <p className="text-primary text-sm font-medium mt-0.5">{candidate.electionTitle}</p>
                  </div>
                  <Badge
                    className={`text-xs shrink-0 ${
                      activeTab === "pending"
                        ? "bg-yellow-100 text-yellow-700 border-yellow-300"
                        : activeTab === "approved"
                        ? "bg-green-100 text-green-700 border-green-300"
                        : "bg-red-100 text-red-600 border-red-300"
                    }`}
                    variant="outline"
                  >
                    {activeTab === "pending" && "PENDING APPROVAL"}
                    {activeTab === "approved" && "APPROVED"}
                    {activeTab === "rejected" && "REJECTED"}
                  </Badge>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <div>
                    <span className="font-semibold text-foreground">Symbol:</span>
                    <span className="ml-2 text-muted-foreground">{candidate.symbol || "—"}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Party:</span>
                    <span className="ml-2 text-muted-foreground">{candidate.party || "Independent"}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="font-semibold text-foreground">Applied:</span>
                    <span className="ml-2 text-muted-foreground">
                      {candidate.appliedAt
                        ? format(new Date(candidate.appliedAt), "M/d/yyyy")
                        : "—"}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-1">
                  {activeTab === "pending" && (
                    <Button
                      className="w-full bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => updateStatus({ id: candidate.id, status: "approved" })}
                      disabled={isPending}
                    >
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  )}
                  {activeTab === "rejected" && (
                    <Button
                      className="w-full bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => updateStatus({ id: candidate.id, status: "approved" })}
                      disabled={isPending}
                    >
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setViewCandidate(candidate)}
                  >
                    <Eye className="mr-2 h-4 w-4" /> Full Details
                  </Button>

                  {activeTab !== "rejected" && (
                    <Button
                      className="w-full bg-red-400 hover:bg-red-500 text-white border-0"
                      variant="outline"
                      onClick={() => updateStatus({ id: candidate.id, status: "rejected" })}
                      disabled={isPending}
                    >
                      <X className="mr-2 h-4 w-4" /> Reject
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Full Details Dialog */}
      {viewCandidate && (
        <Dialog open={!!viewCandidate} onOpenChange={() => setViewCandidate(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{viewCandidate.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground block">Election</span>
                  <span className="font-medium">{viewCandidate.electionTitle}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Status</span>
                  <span className="font-medium capitalize">{viewCandidate.status}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Symbol</span>
                  <span className="font-medium">{viewCandidate.symbol || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Party</span>
                  <span className="font-medium">{viewCandidate.party || "Independent"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Applied</span>
                  <span className="font-medium">
                    {viewCandidate.appliedAt
                      ? format(new Date(viewCandidate.appliedAt), "PPP")
                      : "—"}
                  </span>
                </div>
              </div>
              {viewCandidate.platform && (
                <div>
                  <span className="text-muted-foreground block mb-1">Platform / Manifesto</span>
                  <p className="bg-muted/30 p-3 rounded-lg leading-relaxed">{viewCandidate.platform}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}