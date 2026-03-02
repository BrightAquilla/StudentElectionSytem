import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";

// ── Elections ──────────────────────────────────────────────────────────────

export function useElections() {
  return useQuery({
    queryKey: [api.elections.list.path],
    queryFn: async () => {
      const res = await fetch(api.elections.list.path);
      if (!res.ok) throw new Error("Failed to fetch elections");
      return api.elections.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
  });
}

export function useElection(id: number) {
  return useQuery({
    queryKey: [api.elections.get.path, id],
    queryFn: async () => {
      const res = await fetch(api.elections.get.path.replace(":id", String(id)));
      if (!res.ok) throw new Error("Failed to fetch election");
      return api.elections.get.responses[200].parse(await res.json());
    },
    enabled: !!id,
    refetchInterval: 5000, // Poll every 5 seconds for real-time updates
  });
}

export function useCreateElection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: Parameters<typeof api.elections.create.input.parse>[0]) => {
      const res = await fetch(api.elections.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to create election" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.elections.list.path] });
      toast({ title: "Election created successfully!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create election", description: err.message, variant: "destructive" });
    },
  });
}

export function useUpdateElection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const res = await fetch(api.elections.update.path.replace(":id", String(id)), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update election");
      return res.json();
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: [api.elections.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.elections.get.path, id] });
      toast({ title: "Election updated!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update election", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteElection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.elections.delete.path.replace(":id", String(id)), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete election");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.elections.list.path] });
      toast({ title: "Election deleted." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete election", description: err.message, variant: "destructive" });
    },
  });
}

export function useElectionResults(id: number, options?: { refetchInterval?: number }) {
  return useQuery({
    queryKey: [api.elections.results.path, id],
    queryFn: async () => {
      const res = await fetch(api.elections.results.path.replace(":id", String(id)));
      if (!res.ok) throw new Error("Failed to fetch results");
      return res.json();
    },
    enabled: !!id,
    ...(options?.refetchInterval ? { refetchInterval: options.refetchInterval } : {}),
  });
}

// ── Candidates ─────────────────────────────────────────────────────────────

export function useCreateCandidate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; platform?: string | null; party?: string | null; partyManifesto?: string | null; symbol?: string | null; electionId: number; userId?: number | null; status?: string }) => {
      const res = await fetch(api.candidates.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to add candidate" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_, { electionId }) => {
      queryClient.invalidateQueries({ queryKey: [api.elections.get.path, electionId] });
      queryClient.invalidateQueries({ queryKey: [api.elections.list.path] });
      toast({ title: "Candidate added!" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add candidate", description: err.message, variant: "destructive" });
    },
  });
}

export function useDeleteCandidate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(api.candidates.delete.path.replace(":id", String(id)), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to remove candidate");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.elections.list.path] });
      // Invalidate all election detail queries since we don't know which election
      queryClient.invalidateQueries({ queryKey: [api.elections.get.path] });
      toast({ title: "Candidate removed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove candidate", description: err.message, variant: "destructive" });
    },
  });
}

// ── Votes ──────────────────────────────────────────────────────────────────

export function useCastVote() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ electionId, candidateId }: { electionId: number; candidateId: number }) => {
      const res = await fetch(api.votes.cast.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ electionId, candidateId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to cast vote" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: (_, { electionId }) => {
      queryClient.invalidateQueries({ queryKey: [api.elections.list.path] });
      queryClient.invalidateQueries({ queryKey: [api.elections.get.path, electionId] });
      queryClient.invalidateQueries({ queryKey: [api.votes.mine.path] });
      queryClient.invalidateQueries({ queryKey: [api.analytics.proceedings.path] });
      toast({ title: "Vote cast successfully!", description: "Your vote has been recorded." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to cast vote", description: err.message, variant: "destructive" });
    },
  });
}
