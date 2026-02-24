import {
  useElections,
  useElection,
  useCreateCandidate,
  useElectionResults,
  useDeleteCandidate,
} from "@/hooks/use-elections";
import { useParams, Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, UserPlus, Trash2, Plus, Eye,
  Loader2, Pencil, PowerOff, Power, Upload, X, User,
} from "lucide-react";
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
import { useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { format } from "date-fns";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// ─── Status helper (isPublished checked FIRST) ───────────────────────────────

function getElectionStatus(election: any) {
  const now = new Date();
  if (!election.isPublished)
    return { label: "Inactive", className: "bg-orange-100 text-orange-700 border-orange-200" };
  if (now > new Date(election.endDate))
    return { label: "Ended", className: "bg-gray-100 text-gray-600 border-gray-200" };
  if (now < new Date(election.startDate))
    return { label: "Scheduled", className: "bg-blue-100 text-blue-700 border-blue-200" };
  return { label: "Active", className: "bg-green-100 text-green-700 border-green-200" };
}

// ─── Image compression helper ─────────────────────────────────────────────────
// Resizes image to max 200×200px and compresses to JPEG quality 70 before
// encoding as base64. Keeps payload well under 50KB.

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 200;
      let { width, height } = img;
      if (width > height) {
        if (width > MAX) { height = Math.round(height * MAX / width); width = MAX; }
      } else {
        if (height > MAX) { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── useUpdateElection ────────────────────────────────────────────────────────
// Refetches ALL active queries that start with "/api/elections" so both the
// list AND the detail view update immediately without a page reload.

function useUpdateElection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      const res = await fetch(`/api/elections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update election");
      return res.json();
    },
    onSuccess: async (_data, variables) => {
      // Refetch list
      await queryClient.refetchQueries({ queryKey: ["/api/elections"], type: "active" });
      // Also refetch the specific detail query — the key format used by useElection
      // is typically "/api/elections/:id" as a plain string
      await queryClient.refetchQueries({ queryKey: [`/api/elections/${variables.id}`], type: "active" });
      toast({ title: "Election updated!" });
    },
    onError: () => toast({ title: "Failed to update election", variant: "destructive" }),
  });
}

function useDeleteElection() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/elections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete election");
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/elections"], type: "active" });
      toast({ title: "Election deleted." });
    },
    onError: () => toast({ title: "Failed to delete election", variant: "destructive" }),
  });
}

// ─── useUpdateCandidate ───────────────────────────────────────────────────────

function useUpdateCandidate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, any> }) => {
      const res = await fetch(`/api/candidates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update candidate");
      }
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/elections"], type: "active" });
      toast({ title: "Candidate updated!" });
    },
    onError: (err: any) => toast({ title: err.message || "Failed to update candidate", variant: "destructive" }),
  });
}

// ─── Edit Election Dialog ─────────────────────────────────────────────────────

function EditElectionDialog({ election }: { election: any }) {
  const [open, setOpen] = useState(false);
  const { mutate, isPending } = useUpdateElection();

  const form = useForm({
    defaultValues: {
      title: election.title ?? "",
      description: election.description ?? "",
      startDate: election.startDate ? new Date(election.startDate).toISOString().slice(0, 16) : "",
      endDate: election.endDate ? new Date(election.endDate).toISOString().slice(0, 16) : "",
    },
  });

  const onSubmit = (values: any) => {
    mutate(
      { id: election.id, data: { ...values, startDate: new Date(values.startDate), endDate: new Date(values.endDate) } },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Election</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input {...form.register("title", { required: true })} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea {...form.register("description")} className="min-h-[80px]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Start Date & Time</Label>
              <Input type="datetime-local" {...form.register("startDate", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date & Time</Label>
              <Input type="datetime-local" {...form.register("endDate", { required: true })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Image Upload (with compression) ─────────────────────────────────────────

function ImageUpload({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [compressing, setCompressing] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setCompressing(true);
    try {
      const compressed = await compressImage(file);
      onChange(compressed);
    } finally {
      setCompressing(false);
    }
  }, [onChange]);

  return (
    <div className="space-y-1.5">
      <Label>Candidate Photo</Label>
      {value ? (
        <div className="relative w-20 h-20 group">
          <img src={value} alt="preview" className="w-20 h-20 rounded-full object-cover border-2 border-border" />
          <button type="button" onClick={() => onChange(null)}
            className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div onClick={() => !compressing && inputRef.current?.click()}
          className="w-20 h-20 rounded-full border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors text-muted-foreground gap-0.5">
          {compressing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          <span className="text-[9px] text-center leading-tight">{compressing ? "Processing..." : "Upload Photo"}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
    </div>
  );
}

// ─── Candidate form schema ────────────────────────────────────────────────────

const candidateFormSchema = z.object({
  name: z.string().min(2, "Name is required"),
  position: z.string().min(2, "Position is required"),
  party: z.string().optional(),
  platform: z.string().optional(),
});

// ─── Edit Candidate Dialog ────────────────────────────────────────────────────

function EditCandidateDialog({ candidate }: { candidate: any }) {
  const [open, setOpen] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const { mutate, isPending } = useUpdateCandidate();

  const existingPosition = (candidate.platform as string | null)?.match(/^\[Position:\s*(.+?)\]/)?.[1] ?? "";
  const existingPlatformText = candidate.platform?.replace(/^\[Position:.+?\]\n?/, "").trim() ?? "";
  const existingPhoto =
    typeof candidate.symbol === "string" && candidate.symbol.startsWith("__img__")
      ? candidate.symbol.slice(7)
      : null;

  const form = useForm<z.infer<typeof candidateFormSchema>>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues: {
      name: candidate.name ?? "",
      position: existingPosition,
      party: candidate.party ?? "",
      platform: existingPlatformText,
    },
  });

  const onSubmit = (values: z.infer<typeof candidateFormSchema>) => {
    const combinedPlatform = `[Position: ${values.position}]\n${values.platform || ""}`.trim();
    // Use newly uploaded photo if any, otherwise keep the existing one
    const finalPhoto = photoBase64 ?? existingPhoto;
    const symbolValue = finalPhoto ? `__img__${finalPhoto}` : null;

    mutate(
      {
        id: candidate.id,
        data: {
          name: values.name,
          party: values.party || null,
          symbol: symbolValue,
          platform: combinedPlatform,
        },
      },
      { onSuccess: () => setOpen(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPhotoBase64(null); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary shrink-0 -mt-1">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Edit Candidate</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="flex gap-5 items-start">
            <ImageUpload value={photoBase64 ?? existingPhoto} onChange={setPhotoBase64} />
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input {...form.register("name")} placeholder="e.g. Jane Doe" />
                {form.formState.errors.name && <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Position Vying For <span className="text-destructive">*</span></Label>
                <Input {...form.register("position")} placeholder="e.g. President, Secretary" />
                {form.formState.errors.position && <p className="text-destructive text-xs">{form.formState.errors.position.message}</p>}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Party / Affiliation</Label>
            <Input {...form.register("party")} placeholder="e.g. Independent" />
          </div>
          <div className="space-y-1.5">
            <Label>Platform / Manifesto</Label>
            <Textarea {...form.register("platform")} placeholder="Key policies and goals..." className="min-h-[80px]" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : "Save Changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Candidate Dialog ─────────────────────────────────────────────────────

function AddCandidateDialog({ electionId }: { electionId: number }) {
  const { mutate, isPending } = useCreateCandidate();
  const [open, setOpen] = useState(false);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  const form = useForm<z.infer<typeof candidateFormSchema>>({
    resolver: zodResolver(candidateFormSchema),
    defaultValues: { name: "", position: "", party: "", platform: "" },
  });

  const onSubmit = (values: z.infer<typeof candidateFormSchema>) => {
    const combinedPlatform = `[Position: ${values.position}]\n${values.platform || ""}`.trim();
    const imagePayload = photoBase64 ? `__img__${photoBase64}` : null;

    mutate(
      { electionId, name: values.name, party: values.party || null, symbol: imagePayload, platform: combinedPlatform } as any,
      { onSuccess: () => { setOpen(false); form.reset(); setPhotoBase64(null); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><UserPlus className="mr-2 h-4 w-4" /> Add Candidate</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Add New Candidate</DialogTitle></DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="flex gap-5 items-start">
            <ImageUpload value={photoBase64} onChange={setPhotoBase64} />
            <div className="flex-1 space-y-3">
              <div className="space-y-1.5">
                <Label>Full Name <span className="text-destructive">*</span></Label>
                <Input {...form.register("name")} placeholder="e.g. Jane Doe" />
                {form.formState.errors.name && <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>Position Vying For <span className="text-destructive">*</span></Label>
                <Input {...form.register("position")} placeholder="e.g. President, Secretary" />
                {form.formState.errors.position && <p className="text-destructive text-xs">{form.formState.errors.position.message}</p>}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Party / Affiliation</Label>
            <Input {...form.register("party")} placeholder="e.g. Independent" />
          </div>
          <div className="space-y-1.5">
            <Label>Platform / Manifesto</Label>
            <Textarea {...form.register("platform")} placeholder="Key policies and goals..." className="min-h-[80px]" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</> : <><UserPlus className="mr-2 h-4 w-4" />Add Candidate</>}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Candidate Card ───────────────────────────────────────────────────────────

function CandidateCard({ candidate }: { candidate: any }) {
  const { mutate: deleteCandidate, isPending } = useDeleteCandidate();

  const positionMatch = (candidate.platform as string | null)?.match(/^\[Position:\s*(.+?)\]/);
  const position = positionMatch?.[1];
  const platformText = candidate.platform?.replace(/^\[Position:.+?\]\n?/, "").trim();

  const photoSrc =
    typeof candidate.symbol === "string" && candidate.symbol.startsWith("__img__")
      ? candidate.symbol.slice(7)
      : null;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-primary/10 border-2 border-border flex items-center justify-center shrink-0 overflow-hidden">
            {photoSrc ? (
              <img src={photoSrc} alt={candidate.name} className="h-full w-full object-cover" />
            ) : (
              <User className="h-7 w-7 text-primary/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1">
              <div>
                <h4 className="font-bold text-base leading-tight">{candidate.name}</h4>
                {position && <Badge variant="secondary" className="mt-1 text-xs font-normal">{position}</Badge>}
              </div>
              <div className="flex items-center gap-0.5 shrink-0 -mt-1">
                <EditCandidateDialog candidate={candidate} />
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove Candidate</AlertDialogTitle>
                      <AlertDialogDescription>
                        Remove <strong>{candidate.name}</strong>? This also deletes all their votes and cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteCandidate(candidate.id)} className="bg-destructive hover:bg-destructive/90" disabled={isPending}>
                        {isPending ? "Removing..." : "Remove"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            <div className="flex gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
              {candidate.party && <span><strong>Party:</strong> {candidate.party}</span>}
            </div>
            {platformText && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{platformText}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Elections List View ──────────────────────────────────────────────────────

function AdminElectionsList() {
  const { data: elections, isLoading } = useElections();
  const { mutate: updateElection, isPending: isToggling } = useUpdateElection();
  const { mutate: deleteElection } = useDeleteElection();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Manage Elections</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Create, edit, and manage all elections</p>
        </div>
        <Link href="/admin/create-election">
          <Button><Plus className="mr-2 h-4 w-4" /> Create Election</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !elections || elections.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center text-muted-foreground">
            <p className="font-medium">No elections yet</p>
            <p className="text-sm mt-1">Create your first election to get started.</p>
            <Link href="/admin/create-election">
              <Button variant="outline" className="mt-4"><Plus className="mr-2 h-4 w-4" /> Create Election</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {elections.map((election: any) => {
            const status = getElectionStatus(election);
            return (
              <Card key={election.id} className={`flex flex-col transition-opacity ${!election.isPublished ? "opacity-70" : ""}`}>
                <CardContent className="p-5 flex flex-col gap-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-lg leading-tight">{election.title}</h3>
                    <Badge className={`text-xs shrink-0 ${status.className}`} variant="outline">{status.label}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 flex-1">
                    {election.description || "No description provided."}
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div><span className="font-medium">Start:</span> {format(new Date(election.startDate), "MMM d, yyyy p")}</div>
                    <div><span className="font-medium">End:</span> {format(new Date(election.endDate), "MMM d, yyyy p")}</div>
                  </div>
                  <div className="flex items-center gap-2 py-2 border-t border-border">
                    <Switch
                      id={`toggle-${election.id}`}
                      checked={!!election.isPublished}
                      disabled={isToggling}
                      onCheckedChange={(checked) => updateElection({ id: election.id, data: { isPublished: checked } })}
                    />
                    <Label htmlFor={`toggle-${election.id}`} className="text-xs text-muted-foreground cursor-pointer select-none">
                      {election.isPublished ? "Active — visible to voters" : "Inactive — hidden from voters"}
                    </Label>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setLocation(`/admin/elections/${election.id}`)}>
                      <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                    </Button>
                    <EditElectionDialog election={election} />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive hover:border-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Election</AlertDialogTitle>
                          <AlertDialogDescription>
                            Delete <strong>{election.title}</strong>? This permanently removes all candidates and votes.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteElection(election.id)} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Detail View ──────────────────────────────────────────────────────────────

export default function AdminElectionDetail() {
  const { id } = useParams();
  if (!id) return <AdminElectionsList />;

  const electionId = Number(id);
  const { data: election, isLoading } = useElection(electionId);
  const { data: results } = useElectionResults(electionId);
  const { mutate: updateElection, isPending: isToggling } = useUpdateElection();
  const [activeTab, setActiveTab] = useState("overview");

  if (isLoading || !election)
    return <div className="flex items-center justify-center p-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const status = getElectionStatus(election);

  return (
    <div className="space-y-6">
      <Link href="/admin/elections" className="inline-flex items-center text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Elections
      </Link>

      <div className="flex flex-wrap justify-between items-start gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-display font-bold">{election.title}</h1>
            <Badge variant="outline" className={`text-xs ${status.className}`}>{status.label}</Badge>
          </div>
          <p className="text-muted-foreground mt-1">
            {format(new Date(election.startDate), "MMM d")} – {format(new Date(election.endDate), "MMM d, yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 bg-muted/40 rounded-lg px-3 py-2">
            <Switch
              id="detail-toggle"
              checked={!!election.isPublished}
              disabled={isToggling}
              onCheckedChange={(checked) => updateElection({ id: electionId, data: { isPublished: checked } })}
            />
            <Label htmlFor="detail-toggle" className="text-sm cursor-pointer select-none">
              {election.isPublished ? (
                <span className="flex items-center gap-1 text-green-700"><Power className="h-3.5 w-3.5" /> Active</span>
              ) : (
                <span className="flex items-center gap-1 text-orange-600"><PowerOff className="h-3.5 w-3.5" /> Inactive</span>
              )}
            </Label>
          </div>
          <EditElectionDialog election={election} />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="candidates">Candidates</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Election Details</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block">Status</span>
                  <span className="font-medium">{status.label}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Visibility</span>
                  <span className={`font-medium ${election.isPublished ? "text-green-600" : "text-orange-600"}`}>
                    {election.isPublished ? "Published" : "Unpublished"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Candidates</span>
                  <span className="font-medium">{election.candidates.length}</span>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block text-sm mb-1">Description</span>
                <p className="text-sm bg-muted/30 p-4 rounded-lg">{election.description || "No description."}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="candidates" className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-bold">
              Candidates
              <span className="ml-2 text-sm font-normal text-muted-foreground">({election.candidates.length})</span>
            </h3>
            <AddCandidateDialog electionId={electionId} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {election.candidates.map((candidate: any) => (
              <CandidateCard key={candidate.id} candidate={candidate} />
            ))}
            {election.candidates.length === 0 && (
              <div className="col-span-full text-center p-12 text-muted-foreground border-2 border-dashed rounded-xl">
                <UserPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium">No candidates added yet</p>
                <p className="text-sm mt-1">Click "Add Candidate" to get started.</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          {results ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Results</span>
                  <span className="text-sm font-normal text-muted-foreground">Total Votes: {results.totalVotes}</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {results.totalVotes === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">No votes cast yet.</div>
                ) : (
                  <div className="h-[350px] w-full mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={results.candidates} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                        <XAxis type="number" allowDecimals={false} />
                        <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
                        <Tooltip
                          cursor={{ fill: "transparent" }}
                          contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                          formatter={(v: any) => [`${v} votes`, "Votes"]}
                        />
                        <Bar dataKey="voteCount" radius={[0, 4, 4, 0]}>
                          {results.candidates.map((_: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? "hsl(var(--primary))" : "hsl(var(--accent))"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}