import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
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
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Vote, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { api } from "@shared/routes";

type PartyOption = {
  id: number;
  code: string;
  name: string;
  symbol: string;
  manifesto: string;
  createdAt: string | Date | null;
};

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().regex(/^[A-Z]{2}\d{2}\/PU\/\d{5}\/\d{2}$/i, "Use format like SB30/PU/40239/20"),
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  accountType: z.enum(["voter", "candidate"]),
  party: z.string().optional(),
  symbol: z.string().optional(),
  partyManifesto: z.string().optional(),
  candidateManifesto: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "Passwords don't match",
    });
  }

  if (data.accountType !== "candidate") {
    return;
  }

  if (!data.party) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["party"],
      message: "Select a party",
    });
  }

  if (!data.symbol) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["symbol"],
      message: "Party symbol is required",
    });
  }

  if (!data.partyManifesto) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["partyManifesto"],
      message: "Party manifesto is required",
    });
  }

  if (!data.candidateManifesto || data.candidateManifesto.trim().length < 20) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["candidateManifesto"],
      message: "Candidate manifesto must be at least 20 characters",
    });
  }
});

export default function RegisterPage() {
  const { register, isRegistering, user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: parties = [] } = useQuery<PartyOption[]>({
    queryKey: [api.parties.list.path],
    queryFn: async () => {
      const res = await fetch(api.parties.list.path);
      if (!res.ok) throw new Error("Failed to load parties");
      return api.parties.list.responses[200].parse(await res.json());
    },
  });

  if (user) {
    setLocation(user.isAdmin ? "/admin/dashboard" : user.role === "analyst" ? "/analytics" : user.role === "candidate" ? "/candidate-dashboard" : "/dashboard");
    return null;
  }

  const form = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
      accountType: "voter",
      party: undefined,
      symbol: "",
      partyManifesto: "",
      candidateManifesto: "",
    },
  });

  const accountType = form.watch("accountType");
  const selectedParty = form.watch("party");

  const selectedPartyConfig = useMemo(
    () => parties.find((party) => party.code === selectedParty),
    [parties, selectedParty],
  );

  useEffect(() => {
    if (accountType !== "candidate") {
      form.setValue("party", undefined, { shouldValidate: false });
      form.setValue("symbol", "", { shouldValidate: false });
      form.setValue("partyManifesto", "", { shouldValidate: false });
      form.setValue("candidateManifesto", "", { shouldValidate: false });
      return;
    }

    if (!selectedPartyConfig) {
      form.setValue("symbol", "", { shouldValidate: true });
      form.setValue("partyManifesto", "", { shouldValidate: true });
      return;
    }

    form.setValue("symbol", selectedPartyConfig.symbol, { shouldValidate: true });
    form.setValue("partyManifesto", selectedPartyConfig.manifesto, { shouldValidate: true });
  }, [accountType, selectedPartyConfig, form]);

  function onSubmit(values: z.infer<typeof registerSchema>) {
    const { confirmPassword, ...data } = values;
    const payload = data.accountType === "candidate"
      ? {
          ...data,
          party: selectedPartyConfig?.name,
          symbol: selectedPartyConfig?.symbol,
          partyManifesto: selectedPartyConfig?.manifesto,
          username: data.username.toUpperCase(),
        }
      : {
          name: data.name,
          username: data.username.toUpperCase(),
          email: data.email,
          password: data.password,
          accountType: data.accountType,
        };
    register(payload, {
      onSuccess: () => setLocation("/login"),
    });
  }
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-2xl space-y-8">
        <div className="text-center space-y-2">
          <Link href="/login" className="inline-flex p-3 rounded-2xl bg-primary/10 text-primary mb-4 hover:scale-105 transition-transform">
            <Vote className="w-10 h-10" />
          </Link>
          <h1 className="text-4xl font-display font-bold text-foreground">Create Account</h1>
          <p className="text-muted-foreground text-lg">Join Votely to participate in elections.</p>
        </div>

        <Card className="border-border/50 shadow-xl shadow-black/5">
          <CardHeader>
            <CardTitle>Sign Up</CardTitle>
            <CardDescription>
              Register as a voter or submit a candidate registration. Candidate registrations are held for admin approval before sign-in is allowed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="accountType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Register As</FormLabel>
                      <FormControl>
                        <select
                          value={field.value}
                          onChange={field.onChange}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="voter">Voter</option>
                          <option value="candidate">Candidate</option>
                        </select>
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        Candidate signups create a pending candidate account that must be approved by an administrator.
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Registration Number</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. SB30/PU/40239/20" {...field} className="uppercase" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="student@pwani.ac.ke" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {accountType === "candidate" && (
                  <>
                    <FormField
                      control={form.control}
                      name="party"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Party</FormLabel>
                          <FormControl>
                            <select
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            >
                              <option value="">Select a party</option>
                              {parties.map((party) => (
                                <option key={party.id} value={party.code}>
                                  {party.name}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="symbol"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Party Symbol</FormLabel>
                          <FormControl>
                            <Input {...field} readOnly placeholder="Auto-filled from selected party" />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            The election symbol is assigned automatically from the selected party.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="partyManifesto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Party Manifesto</FormLabel>
                          <FormControl>
                            <Textarea {...field} readOnly rows={4} placeholder="Select a party to preview its manifesto" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="candidateManifesto"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Candidate Manifesto</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              rows={5}
                              placeholder="Write a personal manifesto that aligns with your selected party."
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            Keep this aligned with the selected party manifesto, but make it specific to your own campaign.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Enter at least 6 characters" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="Repeat your password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" className="w-full h-12 text-base mt-2" disabled={isRegistering}>
                  {isRegistering ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link href="/login" className="text-primary font-medium hover:underline">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

