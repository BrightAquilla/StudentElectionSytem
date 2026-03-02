import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Check, X, Eye, ArrowLeft, UserPlus, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@shared/routes";

type Status = "pending" | "approved" | "rejected";

interface CandidateApplication {
  id: number;
  userId: number | null;
  name: string;
  electionId: number;
  electionTitle: string;
  symbol: string | null;
  party: string | null;
  partyManifesto: string | null;
  platform: string | null;
  status: string;
  reviewNotes: string | null;
  reviewedAt: string | null;
  appliedAt: string | null;
  createdAt: string | null;
}

type CandidatePageResponse = {
  items: CandidateApplication[];
  total: number;
  page: number;
  pageSize: number;
};

type ElectionOption = {
  id: number;
  title: string;
  position: string;
  isPublished: boolean;
  startDate: string;
  endDate: string;
};

type PartyOption = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  manifesto: string;
  createdAt: string | Date | null;
};

type CandidateFormState = {
  electionId: string;
  name: string;
  party: string;
  partyManifesto: string;
  platform: string;
  symbol: string;
};

const initialFormState: CandidateFormState = {
  electionId: "",
  name: "",
  party: "",
  partyManifesto: "",
  platform: "",
  symbol: "",
};

function useCandidates(status: Status, search: string, page: number, pageSize: number) {
  return useQuery<CandidatePageResponse>({
    queryKey: ["/api/candidates", status, search, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        status,
        search,
        page: String(page),
        pageSize: String(pageSize),
      });
      const res = await fetch(`/api/candidates?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch candidates");
      return res.json();
    },
  });
}

function useUpdateStatus() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status, reviewNotes }: { id: number; status: Status; reviewNotes?: string }) => {
      const res = await fetch(`/api/candidates/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reviewNotes }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to update status" }));
        throw new Error(err.message || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      toast({ title: "Candidate status updated!" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update status", description: error.message, variant: "destructive" });
    },
  });
}

function useElections() {
  return useQuery<ElectionOption[]>({
    queryKey: [api.elections.list.path, "admin-candidate-form"],
    queryFn: async () => {
      const res = await fetch(api.elections.list.path);
      if (!res.ok) throw new Error("Failed to load elections");
      return res.json();
    },
  });
}

function useParties() {
  return useQuery<PartyOption[]>({
    queryKey: [api.parties.list.path, "admin-candidate-form"],
    queryFn: async () => {
      const res = await fetch(api.parties.list.path);
      if (!res.ok) throw new Error("Failed to load parties");
      return api.parties.list.responses[200].parse(await res.json());
    },
  });
}

function useCreateCandidate(partiesForCreate: PartyOption[]) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CandidateFormState) => {
      const selectedParty = partiesForCreate.find((party) => party.code === input.party);
      const payload = {
        electionId: Number(input.electionId),
        name: input.name.trim(),
        party: selectedParty?.name || null,
        partyManifesto: selectedParty?.manifesto || null,
        platform: input.platform.trim() || null,
        symbol: selectedParty?.symbol || null,
        status: "approved",
      };
      const res = await fetch(api.candidates.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create candidate" }));
        throw new Error(err.message || "Failed to create candidate");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/candidates"] });
      queryClient.invalidateQueries({ queryKey: [api.elections.list.path, "admin-candidate-form"] });
      toast({ title: "Candidate added successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Candidate creation failed", description: error.message, variant: "destructive" });
    },
  });
}

function useCandidateCounts(search: string) {
  const pending = useCandidates("pending", search, 1, 1);
  const approved = useCandidates("approved", search, 1, 1);
  const rejected = useCandidates("rejected", search, 1, 1);
  return {
    pending: pending.data?.total ?? 0,
    approved: approved.data?.total ?? 0,
    rejected: rejected.data?.total ?? 0,
  };
}

export default function AdminCandidates() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Status>("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [viewCandidate, setViewCandidate] = useState<CandidateApplication | null>(null);
  const [reviewAction, setReviewAction] = useState<{ candidate: CandidateApplication; status: Exclude<Status, "pending"> } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [form, setForm] = useState<CandidateFormState>(initialFormState);
  const pageSize = 9;
  const { data: response, isLoading } = useCandidates(activeTab, search, page, pageSize);
  const { data: elections = [], isLoading: electionsLoading } = useElections();
  const { data: parties = [], isLoading: partiesLoading } = useParties();
  const counts = useCandidateCounts(search);
  const { mutate: updateStatus, isPending } = useUpdateStatus();
  const { mutate: createCandidate, isPending: isCreatingCandidate } = useCreateCandidate(parties);
  const candidates = response?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((response?.total ?? 0) / pageSize));
  const availableElections = elections;
  const selectedElection = availableElections.find((election) => String(election.id) === form.electionId);
  const selectedParty = parties.find((party) => party.code === form.party);

  useEffect(() => {
    if (!selectedParty) {
      setForm((current) => ({ ...current, symbol: "", partyManifesto: "" }));
      return;
    }
    setForm((current) => ({
      ...current,
      symbol: selectedParty.symbol,
      partyManifesto: selectedParty.manifesto,
    }));
  }, [selectedParty]);

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

      <Card className="overflow-hidden border-0 shadow-md bg-gradient-to-br from-slate-900 via-indigo-950 to-sky-950 text-white">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="p-6 md:p-8 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-sky-200">Admin Intake</p>
                  <h2 className="text-2xl font-display font-bold mt-2">Add Candidate Manually</h2>
                  <p className="text-sm text-slate-200 mt-2 max-w-2xl">
                    Register a candidate directly into an election with party details, a party manifesto, and a candidate manifesto.
                  </p>
                </div>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
                  <Sparkles className="h-6 w-6 text-sky-200" />
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-sky-100">Election</label>
                  <select
                    className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none backdrop-blur-sm"
                    value={form.electionId}
                    onChange={(e) => setForm((current) => ({ ...current, electionId: e.target.value }))}
                    disabled={electionsLoading || isCreatingCandidate}
                  >
                    <option value="" className="text-slate-900">Select an election</option>
                    {availableElections.map((election) => (
                      <option key={election.id} value={election.id} className="text-slate-900">
                        {election.position} - {election.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-sky-100">Candidate Name</label>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-300 outline-none"
                    placeholder="Enter full candidate name"
                    value={form.name}
                    onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))}
                    disabled={isCreatingCandidate}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-sky-100">Party Name</label>
                  <select
                    className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none backdrop-blur-sm"
                    value={form.party}
                    onChange={(e) => setForm((current) => ({ ...current, party: e.target.value }))}
                    disabled={isCreatingCandidate || partiesLoading}
                  >
                    <option value="" className="text-slate-900">Select a registered party</option>
                    {parties.map((party) => (
                      <option key={party.id} value={party.code} className="text-slate-900">
                        {party.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-sky-100">Symbol / Profile Tag</label>
                  <input
                    className="w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-slate-300 outline-none"
                    placeholder="Auto-filled from selected party"
                    value={form.symbol}
                    readOnly
                    disabled={isCreatingCandidate}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-sky-100">Party Manifesto</label>
                  <Textarea
                    className="min-h-[92px] border-white/15 bg-white/10 text-white placeholder:text-slate-300"
                    placeholder="Select a party to preview its manifesto"
                    value={form.partyManifesto}
                    readOnly
                    disabled={isCreatingCandidate}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-sky-100">Candidate Manifesto</label>
                  <Textarea
                    className="min-h-[92px] border-white/15 bg-white/10 text-white placeholder:text-slate-300"
                    placeholder="Summarize what this candidate will do if elected"
                    value={form.platform}
                    onChange={(e) => setForm((current) => ({ ...current, platform: e.target.value }))}
                    disabled={isCreatingCandidate}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  className="bg-sky-400 text-slate-950 hover:bg-sky-300"
                  disabled={isCreatingCandidate || !form.electionId || !form.name.trim() || !selectedParty}
                  onClick={() => {
                    createCandidate(form, {
                      onSuccess: () => {
                        setForm(initialFormState);
                        setActiveTab("approved");
                        setPage(1);
                      },
                    });
                  }}
                >
                  {isCreatingCandidate ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
                  Add Candidate
                </Button>
                <Button
                  variant="outline"
                  className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                  disabled={isCreatingCandidate}
                  onClick={() => setForm(initialFormState)}
                >
                  Reset Form
                </Button>
              </div>
            </div>

            <div className="border-t xl:border-t-0 xl:border-l border-white/10 bg-white/5 p-6 md:p-8">
              <p className="text-xs uppercase tracking-[0.25em] text-sky-200">Preview</p>
              <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-5 space-y-4">
                <div>
                  <p className="text-xs text-slate-300">Election Position</p>
                  <p className="text-lg font-semibold">{selectedElection?.position || "Select an election"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-300">Candidate</p>
                  <p className="text-base font-medium">{form.name || "Candidate name will appear here"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-300">Party</p>
                  <p className="text-base font-medium">{selectedParty?.name || "Independent / not set"}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-300">Party Manifesto</p>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {form.partyManifesto || "The party agenda will be visible here after you enter it."}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-300">Candidate Manifesto</p>
                  <p className="text-sm text-slate-200 leading-relaxed">
                    {form.platform || "The candidate campaign message will be visible here after you enter it."}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-slate-300">Profile Tag</p>
                    <p className="mt-1 font-semibold text-white">{form.symbol || "Unset"}</p>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <p className="text-slate-300">Status on Save</p>
                    <p className="mt-1 font-semibold text-emerald-300">Approved</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tab Buttons */}
      <div className="flex gap-2 flex-wrap">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setPage(1); }}
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
        <div className="mt-4">
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Search by candidate name, party, or election title..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
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
                      onClick={() => { setReviewAction({ candidate, status: "approved" }); setReviewNotes(candidate.reviewNotes || ""); }}
                      disabled={isPending}
                    >
                      <Check className="mr-2 h-4 w-4" /> Approve
                    </Button>
                  )}
                  {activeTab === "rejected" && (
                    <Button
                      className="w-full bg-green-500 hover:bg-green-600 text-white"
                      onClick={() => { setReviewAction({ candidate, status: "approved" }); setReviewNotes(candidate.reviewNotes || ""); }}
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
                      onClick={() => { setReviewAction({ candidate, status: "rejected" }); setReviewNotes(candidate.reviewNotes || ""); }}
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

      {response && response.total > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Button>
          </div>
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
                  <span className="text-muted-foreground block">Review Note</span>
                  <span className="font-medium">{viewCandidate.reviewNotes || "No note recorded"}</span>
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
                  <span className="text-muted-foreground block mb-1">Candidate Manifesto</span>
                  <p className="bg-muted/30 p-3 rounded-lg leading-relaxed">{viewCandidate.platform}</p>
                </div>
              )}
              {viewCandidate.partyManifesto && (
                <div>
                  <span className="text-muted-foreground block mb-1">Party Manifesto</span>
                  <p className="bg-muted/30 p-3 rounded-lg leading-relaxed">{viewCandidate.partyManifesto}</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {reviewAction && (
        <Dialog open={!!reviewAction} onOpenChange={() => setReviewAction(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{reviewAction.status === "approved" ? "Approve Candidate" : "Reject Candidate"}</DialogTitle>
              <DialogDescription>
                Save an admin note for <strong>{reviewAction.candidate.name}</strong>. This note is visible in the candidate dashboard.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder={reviewAction.status === "approved" ? "Optional approval note..." : "Explain why the application was rejected..."}
                className="min-h-[120px]"
              />
              {reviewAction.status === "rejected" && (
                <p className="text-xs text-muted-foreground">
                  Rejection reason is required. It is shown to the applicant in the candidate dashboard.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setReviewAction(null)}>Cancel</Button>
                <Button
                  variant={reviewAction.status === "approved" ? "default" : "destructive"}
                  disabled={isPending}
                  onClick={() => {
                    if (reviewAction.status === "rejected" && !reviewNotes.trim()) {
                      toast({
                        title: "Rejection reason required",
                        description: "Add a clear rejection reason before rejecting a candidate.",
                        variant: "destructive",
                      });
                      return;
                    }
                    updateStatus(
                      {
                        id: reviewAction.candidate.id,
                        status: reviewAction.status,
                        reviewNotes: reviewNotes.trim(),
                      },
                      {
                        onSuccess: () => {
                          setReviewAction(null);
                          setReviewNotes("");
                        },
                      },
                    );
                  }}
                >
                  {reviewAction.status === "approved" ? "Approve" : "Reject"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
