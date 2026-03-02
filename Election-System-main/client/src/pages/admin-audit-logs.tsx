import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";
import { useElections } from "@/hooks/use-elections";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, Loader2, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { format } from "date-fns";

type AuditLogResponse = z.infer<typeof api.auditLogs.list.responses[200]>;
type AuditLogItem = AuditLogResponse["items"][number];
type AuditExportStatus = z.infer<typeof api.auditLogs.exportStatus.responses[200]>;
type AuditPreset = {
  id: string;
  name: string;
  action: string;
  actionGroup: string;
  actorRole: string;
  search: string;
  selectedElectionId: string;
  dateFrom: string;
  dateTo: string;
};

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "CANDIDATE_APPLICATION_SUBMITTED", label: "Candidate Applications" },
  { value: "CANDIDATE_APPROVED", label: "Candidate Approved" },
  { value: "CANDIDATE_REJECTED", label: "Candidate Rejected" },
  { value: "ELECTION_PUBLISHED", label: "Election Published" },
  { value: "ELECTION_UNPUBLISHED", label: "Election Unpublished" },
  { value: "VOTE_BLOCKED", label: "Blocked Votes" },
  { value: "VOTE_CAST", label: "Votes Cast" },
] as const;

const ACTION_GROUP_OPTIONS = [
  { value: "all", label: "All Event Groups" },
  { value: "candidate_review", label: "Candidate Review" },
  { value: "election_control", label: "Election Control" },
  { value: "voting", label: "Voting Events" },
  { value: "user_management", label: "User Management" },
] as const;

const ROLE_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "admin", label: "Admins" },
  { value: "analyst", label: "Analysts" },
  { value: "voter", label: "Voters" },
] as const;

function formatActionLabel(action: string) {
  return action
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
}

function renderDetails(details: AuditLogItem["details"]) {
  if (!details) return "No additional details";
  return Object.entries(details)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" | ");
}

export default function AdminAuditLogs() {
  const [action, setAction] = useState("all");
  const [actionGroup, setActionGroup] = useState("all");
  const [actorRole, setActorRole] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedElectionId, setSelectedElectionId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [presets, setPresets] = useState<AuditPreset[]>([]);
  const [exportJobId, setExportJobId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 12;
  const { data: elections } = useElections();
  const { data, isLoading, isError } = useQuery<AuditLogResponse>({
    queryKey: [api.auditLogs.list.path, action, actionGroup, actorRole, search, selectedElectionId, dateFrom, dateTo, page, pageSize],
    queryFn: async () => {
      const params = new URLSearchParams({
        action,
        actionGroup,
        actorRole,
        search,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (selectedElectionId !== "all") params.set("electionId", selectedElectionId);
      if (dateFrom) params.set("dateFrom", new Date(dateFrom).toISOString());
      if (dateTo) {
        const endOfDay = new Date(dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        params.set("dateTo", endOfDay.toISOString());
      }
      const res = await fetch(`${api.auditLogs.list.path}?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load audit logs");
      return api.auditLogs.list.responses[200].parse(await res.json());
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const { data: exportStatus } = useQuery<AuditExportStatus>({
    queryKey: [api.auditLogs.exportStatus.path, exportJobId],
    queryFn: async () => {
      const res = await fetch(api.auditLogs.exportStatus.path.replace(":id", String(exportJobId)));
      if (!res.ok) throw new Error("Failed to fetch export status");
      return api.auditLogs.exportStatus.responses[200].parse(await res.json());
    },
    enabled: !!exportJobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / pageSize)),
    [data?.total],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("audit-log-presets");
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setPresets(parsed);
      }
    } catch {
      // Ignore invalid local presets.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("audit-log-presets", JSON.stringify(presets));
  }, [presets]);

  const exportFilters = useMemo(() => {
    const payload: Record<string, string> = {
      action,
      actionGroup,
      actorRole,
      search,
    };
    if (selectedElectionId !== "all") payload.electionId = selectedElectionId;
    if (dateFrom) payload.dateFrom = new Date(dateFrom).toISOString();
    if (dateTo) {
      const endOfDay = new Date(dateTo);
      endOfDay.setHours(23, 59, 59, 999);
      payload.dateTo = endOfDay.toISOString();
    }
    return payload;
  }, [action, actionGroup, actorRole, search, selectedElectionId, dateFrom, dateTo]);

  const applyPreset = (preset: AuditPreset) => {
    setAction(preset.action);
    setActionGroup(preset.actionGroup);
    setActorRole(preset.actorRole);
    setSearch(preset.search);
    setSelectedElectionId(preset.selectedElectionId);
    setDateFrom(preset.dateFrom);
    setDateTo(preset.dateTo);
    setPage(1);
  };

  const saveCurrentPreset = () => {
    const name = window.prompt("Preset name");
    if (!name?.trim()) return;
    const preset: AuditPreset = {
      id: `${Date.now()}`,
      name: name.trim(),
      action,
      actionGroup,
      actorRole,
      search,
      selectedElectionId,
      dateFrom,
      dateTo,
    };
    setPresets((current) => [preset, ...current].slice(0, 8));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/dashboard" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Audit Trail</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Review election-sensitive system events, approvals, and blocked actions.
          </p>
        </div>
      </div>

      <Card className="bg-white">
        <CardContent className="p-4 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Filter Action</p>
            <Select value={action} onValueChange={(value) => { setAction(value); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Action Group</p>
            <Select value={actionGroup} onValueChange={(value) => { setActionGroup(value); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by event group" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_GROUP_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Actor Role</p>
            <Select value={actorRole} onValueChange={(value) => { setActorRole(value); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Filter by actor role" />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Search Logs</p>
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search action, actor, target, or details..."
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Election</p>
            <Select value={selectedElectionId} onValueChange={(value) => { setSelectedElectionId(value); setPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="All elections" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Elections</SelectItem>
                {(elections ?? []).map((election) => (
                  <SelectItem key={election.id} value={String(election.id)}>
                    {election.title} ({election.position})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">From</p>
              <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">To</p>
              <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
            </div>
          </div>
          <div className="md:col-span-2 xl:col-span-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={saveCurrentPreset}>
                Save Preset
              </Button>
              {presets.map((preset) => (
                <div key={preset.id} className="flex items-center gap-1">
                  <Button type="button" variant="secondary" size="sm" onClick={() => applyPreset(preset)}>
                    {preset.name}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPresets((current) => current.filter((entry) => entry.id !== preset.id))}
                  >
                    x
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {exportStatus?.status && (
                <Badge variant="outline" className="uppercase tracking-wide">
                  Export {exportStatus.status}
                </Badge>
              )}
              {exportStatus?.status === "completed" && exportStatus.downloadPath && (
                <Button
                  type="button"
                  variant="default"
                  onClick={() => {
                    const downloadPath = exportStatus.downloadPath;
                    if (downloadPath) {
                      window.open(downloadPath, "_blank");
                    }
                  }}
                >
                  Download Ready CSV
                </Button>
              )}
              {exportStatus?.status === "failed" && exportStatus.error && (
                <span className="text-xs text-destructive">{exportStatus.error}</span>
              )}
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                if ((data?.total ?? 0) > 2000) {
                  const res = await fetch(api.auditLogs.exportCreate.path, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(exportFilters),
                  });
                  if (!res.ok) return;
                  const payload = api.auditLogs.exportCreate.responses[202].parse(await res.json());
                  setExportJobId(payload.jobId);
                  return;
                }
                const params = new URLSearchParams(exportFilters);
                window.open(`${api.auditLogs.export.path}?${params.toString()}`, "_blank");
              }}
            >
              <Download className="mr-2 h-4 w-4" />
              {(data?.total ?? 0) > 2000 ? "Export CSV in Background" : "Export CSV"}
            </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <Card className="border-destructive/20">
          <CardContent className="p-8 text-sm text-destructive">
            Failed to load the audit trail.
          </CardContent>
        </Card>
      ) : data && data.items.length > 0 ? (
        <>
          <div className="grid gap-4">
            {data.items.map((entry) => (
              <Card key={entry.id} className="bg-white">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <CardTitle className="text-base">{formatActionLabel(entry.action)}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{entry.actorName}</span>
                        <Badge variant="outline" className="uppercase tracking-wide">
                          {entry.actorRole}
                        </Badge>
                        {entry.targetName && <span>to {entry.targetName}</span>}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {format(new Date(entry.createdAt), "PPP p")}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border bg-muted/20 p-3 text-sm leading-relaxed">
                    {renderDetails(entry.details)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    <span>Log ID #{entry.id}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {data.total > pageSize && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <Card className="bg-white border-dashed">
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            No audit log entries match the current filters.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
