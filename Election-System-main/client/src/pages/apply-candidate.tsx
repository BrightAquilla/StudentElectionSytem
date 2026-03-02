import { useElections } from "@/hooks/use-elections";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Loader2, UserPlus } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useMemo } from "react";
import { api } from "@shared/routes";

type PartyOption = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  manifesto: string;
  createdAt: string | Date | null;
};

const applySchema = z.object({
  electionId: z.string().min(1, "Please select an election"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  party: z.string().min(1, "Party or affiliation is required"),
  partyManifesto: z.string().min(20, "Please provide a party manifesto (min 20 characters)"),
  symbol: z.string().min(1, "Symbol is required"),
  platform: z.string().min(10, "Please describe your platform (min 10 characters)"),
});

export default function ApplyCandidate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: elections } = useElections();
  const { user } = useAuth();
  const { data: parties = [] } = useQuery<PartyOption[]>({
    queryKey: [api.parties.list.path, "apply-candidate"],
    queryFn: async () => {
      const res = await fetch(api.parties.list.path);
      if (!res.ok) throw new Error("Failed to load parties");
      return api.parties.list.responses[200].parse(await res.json());
    },
  });

  // Get election ID from URL query params
  const queryParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const preSelectedElectionId = queryParams.get('electionId');

  // Only show upcoming elections that haven't started yet
  const now = new Date();
  const profile = (() => {
    const match = /^([A-Z]{2})\d{2}\/PU\/\d{5}\/(\d{2})$/i.exec(user?.username || "");
    if (!match) return null;
    const facultyCode = match[1].toUpperCase();
    const intakeShortYear = Number(match[2]);
    const currentShortYear = new Date().getFullYear() % 100;
    const yearLevel = Math.max(1, Math.min(6, currentShortYear - intakeShortYear + 1));
    return { facultyCode, yearLevel };
  })();
  const upcomingElections = elections?.filter(
    (e) => {
      if (!(now < new Date(e.startDate))) return false;
      if (!profile) return true;
      const facultyRules = String((e as any).eligibleFaculties || "").split(",").map((entry) => entry.trim()).filter(Boolean);
      const yearRules = String((e as any).eligibleYearLevels || "").split(",").map((entry) => entry.trim()).filter(Boolean);
      const facultyAllowed = facultyRules.length === 0 || facultyRules.includes(profile.facultyCode);
      const yearAllowed = yearRules.length === 0 || yearRules.includes(String(profile.yearLevel));
      return facultyAllowed && yearAllowed;
    }
  ) ?? [];

  const form = useForm<z.infer<typeof applySchema>>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      electionId: preSelectedElectionId || "",
      name: "",
      party: "",
      partyManifesto: "",
      symbol: "",
      platform: "",
    },
  });
  const selectedParty = form.watch("party");
  const selectedPartyConfig = useMemo(
    () => parties.find((party) => party.code === selectedParty),
    [parties, selectedParty],
  );

  // Update the form when preSelectedElectionId changes
  useEffect(() => {
    if (preSelectedElectionId) {
      form.setValue("electionId", preSelectedElectionId);
    }
  }, [preSelectedElectionId, form]);

  useEffect(() => {
    if (!selectedPartyConfig) {
      form.setValue("symbol", "", { shouldValidate: true });
      form.setValue("partyManifesto", "", { shouldValidate: true });
      return;
    }

    form.setValue("symbol", selectedPartyConfig.symbol, { shouldValidate: true });
    form.setValue("partyManifesto", selectedPartyConfig.manifesto, { shouldValidate: true });
  }, [selectedPartyConfig, form]);

  const { mutate, isPending } = useMutation({
    mutationFn: async (values: z.infer<typeof applySchema>) => {
      const res = await fetch("/api/candidates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          party: selectedPartyConfig?.name || values.party,
          partyManifesto: selectedPartyConfig?.manifesto || values.partyManifesto,
          symbol: selectedPartyConfig?.symbol || values.symbol,
          electionId: Number(values.electionId),
          status: "pending",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to submit application" }));
        throw new Error(err.message);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Application submitted!",
        description: "Your candidate application is pending admin review.",
      });
      setLocation("/dashboard");
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to submit application",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/dashboard" className="inline-flex items-center text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <UserPlus className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Apply as Candidate</h1>
          <p className="text-muted-foreground text-sm">Submit your application for an upcoming election</p>
        </div>
      </div>

      {upcomingElections.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <UserPlus className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <h3 className="font-semibold mb-1">No Upcoming Elections</h3>
            <p className="text-muted-foreground text-sm">
              There are no upcoming elections accepting candidates right now. Check back later.
            </p>
            <Link href="/elections">
              <Button variant="outline" className="mt-4">View All Elections</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Candidate Application Form</CardTitle>
            <CardDescription>
              Your application will be reviewed by an administrator before being approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => mutate(v))} className="space-y-5">
                {/* Election */}
                <FormField
                  control={form.control}
                  name="electionId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Election</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an election to apply for" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {upcomingElections.map((e) => (
                            <SelectItem key={e.id} value={String(e.id)}>
                              {e.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Full Name */}
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your full name as it will appear on the ballot" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  {/* Party */}
                  <FormField
                    control={form.control}
                    name="party"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Party</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a registered party" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {parties.map((party) => (
                              <SelectItem key={party.id} value={party.code}>
                                {party.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription className="text-xs">
                          Select from the existing party registry. Free-text party entry is disabled here.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Symbol */}
                  <FormField
                    control={form.control}
                    name="symbol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Election Symbol</FormLabel>
                        <FormControl>
                          <Input placeholder="Auto-filled from selected party" {...field} readOnly />
                        </FormControl>
                        <FormDescription className="text-xs">
                          This is assigned automatically from the selected party.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="partyManifesto"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Party Manifesto</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Select a party to preview its manifesto"
                          className="min-h-[110px]"
                          readOnly
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        This is the party's shared agenda. Your personal manifesto below should stay aligned with it.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Platform */}
                <FormField
                  control={form.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Candidate Manifesto</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe your key policies, goals, and why voters should choose you..."
                          className="min-h-[140px]"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-3 pt-2">
                  <Link href="/dashboard">
                    <Button type="button" variant="outline">Cancel</Button>
                  </Link>
                  <Button type="submit" disabled={isPending} className="flex-1">
                    {isPending ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                    ) : (
                      <><UserPlus className="mr-2 h-4 w-4" /> Submit Application</>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
