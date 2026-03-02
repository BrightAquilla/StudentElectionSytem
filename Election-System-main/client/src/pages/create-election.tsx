import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ELECTION_POSITIONS, FACULTY_CODES, insertElectionSchema } from "@shared/schema";
import { useCreateElection } from "@/hooks/use-elections";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { z } from "zod";

// Extend schema to handle date strings from input
const formSchema = insertElectionSchema.extend({
  startDate: z.string(),
  endDate: z.string(),
});

const YEAR_LEVEL_OPTIONS = ["1", "2", "3", "4", "5", "6"];

function toggleCsvSelection(currentValue: string | null | undefined, item: string) {
  const values = String(currentValue || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (values.includes(item)) {
    return values.filter((entry) => entry !== item).join(",");
  }

  return [...values, item].join(",");
}

function parseCsv(value: string | null | undefined) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function CreateElection() {
  const { mutate, isPending } = useCreateElection();
  const [, setLocation] = useLocation();
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      position: "President",
      description: "",
      eligibleFaculties: "",
      eligibleYearLevels: "",
      startDate: "",
      endDate: "",
      isPublished: true,
    },
  });
  const selectedFaculties = parseCsv(form.watch("eligibleFaculties"));
  const selectedYearLevels = parseCsv(form.watch("eligibleYearLevels"));

  function onSubmit(values: z.infer<typeof formSchema>) {
    mutate({
      ...values,
      startDate: new Date(values.startDate),
      endDate: new Date(values.endDate),
    }, {
      onSuccess: () => {
        setLocation("/admin/dashboard");
      },
    });
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link href="/admin/dashboard" className="inline-flex items-center text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
      </Link>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-display font-bold">Create New Election</h1>
        <p className="text-muted-foreground">Setup details for upcoming polls.</p>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="pt-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Election Title</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. 2024 Student Council Election" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Position Being Vied For</FormLabel>
                    <FormControl>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={field.value}
                        onChange={field.onChange}
                      >
                        {ELECTION_POSITIONS.map((position) => (
                          <option key={position} value={position}>
                            {position}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormDescription>Select one position for this election.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Describe what this election is for..." className="min-h-[100px]" {...field} value={field.value || ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="eligibleFaculties"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Eligible Faculty Codes</FormLabel>
                    <FormDescription>
                      Leave empty to allow all faculties. Restrict candidate applications to selected faculty codes.
                    </FormDescription>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {FACULTY_CODES.map((facultyCode) => {
                        const selected = String(field.value || "").split(",").filter(Boolean).includes(facultyCode);
                        return (
                          <label key={facultyCode} className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => field.onChange(toggleCsvSelection(field.value, facultyCode))}
                            />
                            <span>{facultyCode}</span>
                          </label>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="eligibleYearLevels"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Eligible Year Levels</FormLabel>
                    <FormDescription>
                      Leave empty to allow all year levels. Applies to candidate applications for this office.
                    </FormDescription>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {YEAR_LEVEL_OPTIONS.map((yearLevel) => {
                        const selected = String(field.value || "").split(",").filter(Boolean).includes(yearLevel);
                        return (
                          <label key={yearLevel} className="flex items-center justify-center gap-2 rounded-md border border-input px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => field.onChange(toggleCsvSelection(field.value, yearLevel))}
                            />
                            <span>Y{yearLevel}</span>
                          </label>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Start Date & Time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>End Date & Time</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold">Eligibility Summary</p>
                  <p className="text-xs text-muted-foreground">This is how the office restrictions will appear to admins and applicants.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedFaculties.length > 0 ? selectedFaculties.map((faculty) => (
                    <span key={faculty} className="rounded-full border px-3 py-1 text-xs font-medium">
                      Faculty: {faculty}
                    </span>
                  )) : (
                    <span className="rounded-full border px-3 py-1 text-xs font-medium">All faculties</span>
                  )}
                  {selectedYearLevels.length > 0 ? selectedYearLevels.map((yearLevel) => (
                    <span key={yearLevel} className="rounded-full border px-3 py-1 text-xs font-medium">
                      Year {yearLevel}
                    </span>
                  )) : (
                    <span className="rounded-full border px-3 py-1 text-xs font-medium">All year levels</span>
                  )}
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-4">
                <Link href="/admin/dashboard">
                  <Button type="button" variant="outline">Cancel</Button>
                </Link>
                <Button type="submit" disabled={isPending}>
                  {isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : "Create Election"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
