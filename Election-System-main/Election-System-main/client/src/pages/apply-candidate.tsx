import { useElections } from "@/hooks/use-elections";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
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

const applySchema = z.object({
  electionId: z.string().min(1, "Please select an election"),
  name: z.string().min(2, "Name must be at least 2 characters"),
  party: z.string().min(1, "Party or affiliation is required"),
  symbol: z.string().min(1, "Symbol is required"),
  platform: z.string().min(10, "Please describe your platform (min 10 characters)"),
});

export default function ApplyCandidate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: elections } = useElections();

  // Only show upcoming elections that haven't started yet
  const now = new Date();
  const upcomingElections = elections?.filter(
    (e) => now < new Date(e.startDate)
  ) ?? [];

  const form = useForm<z.infer<typeof applySchema>>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      electionId: "",
      name: "",
      party: "",
      symbol: "",
      platform: "",
    },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (values: z.infer<typeof applySchema>) => {
      const res = await fetch("/api/candidates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
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
                        <FormLabel>Party / Affiliation</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Green Party, Independent" {...field} />
                        </FormControl>
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
                          <Input placeholder="e.g. Tree, Flower, Star" {...field} />
                        </FormControl>
                        <FormDescription className="text-xs">
                          A unique symbol voters can identify you by
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Platform */}
                <FormField
                  control={form.control}
                  name="platform"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Platform / Manifesto</FormLabel>
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
