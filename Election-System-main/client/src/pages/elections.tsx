import { useElections } from "@/hooks/use-elections";
import { ElectionCard } from "@/components/election-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertCircle, RefreshCw, Search } from "lucide-react";
import { useState, useMemo } from "react";

type FilterTab = "all" | "active" | "upcoming" | "past";

export default function ElectionsPage() {
  const { data: elections, isLoading, error, refetch } = useElections();
  const [activeFilter, setActiveFilter] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const now = new Date();

  const filtered = useMemo(() => {
    let list = elections ?? [];

    if (activeFilter === "active") {
      list = list.filter(
        (e) => new Date(e.startDate) <= now && now <= new Date(e.endDate)
      );
    } else if (activeFilter === "upcoming") {
      list = list.filter((e) => now < new Date(e.startDate));
    } else if (activeFilter === "past") {
      list = list.filter((e) => now > new Date(e.endDate));
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          (e.description ?? "").toLowerCase().includes(q)
      );
    }

    return list;
  }, [elections, activeFilter, search, now]);

  const counts = useMemo(() => {
    const all = elections ?? [];
    return {
      all: all.length,
      active: all.filter(
        (e) => new Date(e.startDate) <= now && now <= new Date(e.endDate)
      ).length,
      upcoming: all.filter((e) => now < new Date(e.startDate)).length,
      past: all.filter((e) => now > new Date(e.endDate)).length,
    };
  }, [elections]);

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <h2 className="text-2xl font-bold text-foreground">Something went wrong</h2>
        <p className="text-muted-foreground">Failed to load elections. Please try again.</p>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: `All (${counts.all})` },
    { key: "active", label: `Active (${counts.active})` },
    { key: "upcoming", label: `Upcoming (${counts.upcoming})` },
    { key: "past", label: `Past (${counts.past})` },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-bold text-foreground">Elections</h1>
        <p className="text-muted-foreground mt-1">Browse and participate in elections.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
                activeFilter === tab.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search elections..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <Card className="bg-muted/20 border-dashed">
          <CardContent className="p-12 text-center">
            <h3 className="text-lg font-semibold mb-2">No elections found</h3>
            <p className="text-muted-foreground">
              {search
                ? `No results for "${search}". Try a different search.`
                : "There are no elections in this category yet."}
            </p>
            {search && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => setSearch("")}
              >
                Clear Search
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((election) => (
            <ElectionCard key={election.id} election={election} />
          ))}
        </div>
      )}
    </div>
  );
}