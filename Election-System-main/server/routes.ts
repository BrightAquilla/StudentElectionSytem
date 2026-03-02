import type { Express } from "express";
import type { Server } from "http";
import { hashPassword, setupAuth } from "./auth";
import { storage, VoteProcessingError } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import express from "express";
import { broadcastActivity, broadcastRealtime } from "./realtime";
import { rateLimit } from "./rate-limit";
import { isUserEligibleForElection } from "./eligibility";
import { getPerformanceActivityMetrics, getPerformanceHistory, getPerformanceMetrics, resetPerformanceMetrics } from "./performance";

type AuditExportJob = {
  id: string;
  status: "queued" | "running" | "completed" | "failed";
  csv: string | null;
  error: string | null;
  createdAt: number;
};

const auditExportJobs = new Map<string, AuditExportJob>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const toSafeUser = (user: {
    id: number;
    username: string;
    email: string;
    name: string;
    role: string;
    isAdmin: boolean;
    isDisabled: boolean;
    deletedAt: Date | null;
    createdAt: Date | null;
    isCandidate?: boolean;
    candidateParty?: string | null;
    candidateSymbol?: string | null;
    candidatePartyManifesto?: string | null;
    candidateManifesto?: string | null;
    candidateApprovalStatus?: string | null;
  }) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    isAdmin: user.isAdmin,
    isDisabled: user.isDisabled,
    deletedAt: user.deletedAt,
    createdAt: user.createdAt,
    isCandidate: user.isCandidate ?? false,
    candidateParty: user.candidateParty ?? null,
    candidateSymbol: user.candidateSymbol ?? null,
    candidatePartyManifesto: user.candidatePartyManifesto ?? null,
    candidateManifesto: user.candidateManifesto ?? null,
    candidateApprovalStatus: user.candidateApprovalStatus ?? "not_applicable",
  });

  // Setup Authentication
  setupAuth(app);

  // Increase body size limit to support base64 image uploads
  app.use(express.json({ limit: "10mb" }));

  app.get(api.parties.list.path, async (_req, res) => {
    const items = await storage.getParties();
    res.json(items);
  });
  app.post(api.parties.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    try {
      const input = api.parties.create.input.parse({
        ...req.body,
        code: String(req.body.code || "").trim().toLowerCase(),
        name: String(req.body.name || "").trim(),
        symbol: String(req.body.symbol || "").trim(),
        manifesto: String(req.body.manifesto || "").trim(),
      });
      const existing = await storage.getPartyByCode(input.code);
      if (existing) {
        return res.status(409).json({ message: "Party code already exists" });
      }
      const created = await storage.createParty(input);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      if (isUniqueViolation(err)) {
        return res.status(409).json({ message: "Party code already exists" });
      }
      throw err;
    }
  });
  app.patch(api.parties.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    try {
      const input = api.parties.update.input.parse({
        ...req.body,
        code: String(req.body.code || "").trim().toLowerCase(),
        name: String(req.body.name || "").trim(),
        symbol: String(req.body.symbol || "").trim(),
        manifesto: String(req.body.manifesto || "").trim(),
      });
      const existingByCode = await storage.getPartyByCode(input.code);
      if (existingByCode && existingByCode.id !== id) {
        return res.status(409).json({ message: "Party code already exists" });
      }
      const updated = await storage.updateParty(id, input);
      if (!updated) {
        return res.status(404).json({ message: "Party not found" });
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      if (isUniqueViolation(err)) {
        return res.status(409).json({ message: "Party code already exists" });
      }
      throw err;
    }
  });
  app.delete(api.parties.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const deleted = await storage.deleteParty(id);
    if (!deleted) {
      return res.status(404).json({ message: "Party not found" });
    }
    res.sendStatus(204);
  });

  const logAuthenticatedAudit = async (
    req: any,
    action: string,
    details?: Record<string, unknown>,
    targetUserId?: number,
  ) => {
    if (!req.isAuthenticated()) return;
    await storage.createAuditLog({
      actorId: req.user!.id,
      action,
      targetUserId,
      details: details ? JSON.stringify(details) : undefined,
    });
  };
  const invalidateAnalytics = () => {
    storage.invalidateAnalyticsCache();
  };
  const emitActivity = (
    type: string,
    summary: string,
    options?: {
      actor?: string;
      target?: string;
      scope?: string;
      status?: "info" | "success" | "warning" | "error";
      meta?: Record<string, unknown>;
    },
  ) => {
    broadcastActivity({
      type,
      summary,
      actor: options?.actor,
      target: options?.target,
      scope: options?.scope,
      status: options?.status,
      meta: options?.meta,
    });
  };

  // === Election Routes ===

  app.get(api.elections.list.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const elections = await storage.getElections();
    
    // If voter, check if they have voted in each election
    if (!req.user!.isAdmin) {
      const electionsWithStatus = await Promise.all(elections.map(async (election) => {
        const hasVoted = await storage.hasUserVoted(req.user!.id, election.id);
        return { ...election, hasVoted };
      }));
      return res.json(electionsWithStatus);
    }

    res.json(elections);
  });

  app.get(api.elections.get.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const id = parseInt(req.params.id);
    const election = await storage.getElectionWithCandidates(id);
    
    if (!election) {
      return res.status(404).json({ message: "Election not found" });
    }

    if (!req.user!.isAdmin) {
      const hasVoted = await storage.hasUserVoted(req.user!.id, id);
      return res.json({ ...election, hasVoted });
    }

    res.json(election);
  });

  app.post(api.elections.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    try {
      // Coerce date strings from the form into proper Date objects before validation
      const body = {
        ...req.body,
        startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
        endDate: req.body.endDate ? new Date(req.body.endDate) : undefined,
      };
      const input = api.elections.create.input.parse(body);
      const election = await storage.createElection(input);
      invalidateAnalytics();
      emitActivity("election_created", `Election created for ${election.position}`, {
        actor: req.user!.username,
        target: election.title,
        scope: "elections",
        status: "success",
        meta: { electionId: election.id, position: election.position },
      });
      res.status(201).json(election);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      throw err;
    }
  });

  app.patch(api.elections.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    const id = parseInt(req.params.id);
    try {
      const body = {
        ...req.body,
        ...(req.body.startDate && { startDate: new Date(req.body.startDate) }),
        ...(req.body.endDate && { endDate: new Date(req.body.endDate) }),
      };
      const input = api.elections.update.input.parse(body);
      const current = await storage.getElection(id);
      if (!current) {
        return res.status(404).json({ message: "Election not found" });
      }
      const updated = await storage.updateElection(id, input);
      invalidateAnalytics();
      if (typeof input.isPublished === "boolean" && input.isPublished !== current.isPublished) {
        await logAuthenticatedAudit(req, input.isPublished ? "ELECTION_PUBLISHED" : "ELECTION_UNPUBLISHED", {
          electionId: updated.id,
          title: updated.title,
          position: updated.position,
        });
      }
      emitActivity("election_updated", `Election updated: ${updated.title}`, {
        actor: req.user!.username,
        target: updated.title,
        scope: "elections",
        status: "info",
        meta: { electionId: updated.id, position: updated.position },
      });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      res.status(404).json({ message: "Election not found" });
    }
  });

  app.delete(api.elections.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    const id = parseInt(req.params.id);
    const existing = await storage.getElection(id);
    await storage.deleteElection(id);
    invalidateAnalytics();
    if (existing) {
      emitActivity("election_deleted", `Election removed: ${existing.title}`, {
        actor: req.user!.username,
        target: existing.title,
        scope: "elections",
        status: "warning",
        meta: { electionId: existing.id, position: existing.position },
      });
    }
    res.sendStatus(204);
  });

  app.get(api.elections.results.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const id = parseInt(req.params.id);
    const results = await storage.getElectionResults(id);
    
    if (!results) {
      return res.status(404).json({ message: "Election not found" });
    }

    res.json(results);
  });

  app.get(api.analytics.get.path, async (req, res) => {
    if (!req.isAuthenticated() || (!req.user!.isAdmin && req.user!.role !== "analyst")) return res.sendStatus(403);

    try {
      const analytics = await storage.getSystemAnalytics();
      res.json(analytics);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  app.get(api.analytics.proceedings.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const analytics = await storage.getProceedingsAnalytics();
      const isPrivileged = req.user!.isAdmin || req.user!.role === "analyst";
      if (isPrivileged) {
        return res.json(analytics);
      }

      // Public voter-facing analytics: hide inactive positions and sensitive voter totals.
      const publicByPosition = analytics.byPosition
        .filter((section) => section.status !== "Inactive")
        .map((section) => ({
          ...section,
          candidates: section.candidates.map((candidate) => ({
            ...candidate,
            party: null,
          })),
        }));
      const publicTotals = {
        totalVoters: 0,
        totalElections: publicByPosition.length,
        totalVotesCast: analytics.totals.totalVotesCast,
        activeElections: publicByPosition.filter((section) => section.status === "Active").length,
      };

      return res.json({
        totals: publicTotals,
        byPosition: publicByPosition,
        votesByElection: analytics.votesByElection.filter((election) => election.status !== "Inactive"),
        turnoutTimeline: analytics.turnoutTimeline,
        turnoutByPhase: analytics.turnoutByPhase.filter((phase) => phase.phase !== "Inactive"),
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch proceedings analytics" });
    }
  });

  // === Candidate Routes ===

  app.post(api.candidates.create.path, rateLimit({ windowMs: 60_000, max: 30, scope: "candidate-create" }), async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    try {
      const input = api.candidates.create.input.parse(req.body);
      const existing = await storage.findActiveCandidateByName(input.name, input.electionId);
      if (existing) {
        return res.status(400).json({
          message: `Candidate "${input.name}" is already in ${existing.electionPosition} (${existing.electionTitle}). A candidate can only run in one active election position.`,
        });
      }
      const candidate = await storage.createCandidate(input);
      invalidateAnalytics();
      emitActivity("candidate_created", `Candidate added: ${candidate.name}`, {
        actor: req.user!.username,
        target: candidate.name,
        scope: "candidates",
        status: "success",
        meta: { electionId: candidate.electionId, status: candidate.status },
      });
      res.status(201).json(candidate);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Voter applies as candidate (status starts as "pending")
  app.post("/api/candidates/apply", rateLimit({ windowMs: 10 * 60_000, max: 10, scope: "candidate-apply" }), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!["voter", "candidate"].includes(req.user!.role)) return res.status(403).json({ message: "Only registered voters can apply as candidates" });

    try {
      const { electionId, name, party, partyManifesto, symbol, platform } = req.body;
      if (!electionId || !name) {
        return res.status(400).json({ message: "electionId and name are required" });
      }

      // Verify election exists and hasn't started yet
      const election = await storage.getElection(Number(electionId));
      if (!election) return res.status(404).json({ message: "Election not found" });
      if (new Date() >= election.startDate) {
        return res.status(400).json({ message: "Cannot apply after election has started" });
      }
      const existing = await storage.findActiveCandidateByName(name, Number(electionId));
      if (existing) {
        return res.status(400).json({
          message: `Candidate "${name}" is already in ${existing.electionPosition} (${existing.electionTitle}). A candidate can only run in one active election position.`,
        });
      }
      const existingByUser = await storage.findActiveCandidateByUserId(req.user!.id, Number(electionId));
      if (existingByUser) {
        return res.status(400).json({
          message: `You already have an active candidacy in ${existingByUser.electionPosition} (${existingByUser.electionTitle}). One voter can only run for one active position at a time.`,
        });
      }
      if (!isUserEligibleForElection(req.user!, election)) {
        return res.status(400).json({
          message: "You do not meet the faculty/year eligibility rules for this office.",
        });
      }

      const candidate = await storage.createCandidate({
        electionId: Number(electionId),
        userId: req.user!.id,
        name,
        party: party || null,
        partyManifesto: partyManifesto || null,
        symbol: symbol || null,
        platform: platform || null,
        status: "pending",
      });
      invalidateAnalytics();
      await logAuthenticatedAudit(req, "CANDIDATE_APPLICATION_SUBMITTED", {
        electionId: Number(electionId),
        candidateName: name,
        party: party || null,
      });
      emitActivity("candidate_applied", `${name} submitted a candidacy application`, {
        actor: req.user!.username,
        target: name,
        scope: "candidates",
        status: "info",
        meta: { electionId: Number(electionId) },
      });
      res.status(201).json(candidate);
    } catch (err) {
      res.status(500).json({ message: "Failed to submit application" });
    }
  });

  // Update candidate details (name, party, symbol/image, platform) - admin edit
  app.patch("/api/candidates/:id", async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    try {
      const current = await storage.getCandidate(id);
      if (!current) {
        return res.status(404).json({ message: "Candidate not found" });
      }

      const requestedName = typeof req.body?.name === "string" ? req.body.name : current.name;
      const existing = await storage.findActiveCandidateByName(requestedName, current.electionId, id);
      if (existing) {
        return res.status(400).json({
          message: `Candidate "${requestedName}" is already in ${existing.electionPosition} (${existing.electionTitle}). A candidate can only run in one active election position.`,
        });
      }

      const updated = await storage.updateCandidate(id, req.body);
      invalidateAnalytics();
      emitActivity("candidate_updated", `Candidate updated: ${updated.name}`, {
        actor: req.user!.username,
        target: updated.name,
        scope: "candidates",
        status: "info",
        meta: { electionId: updated.electionId, status: updated.status },
      });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update candidate" });
    }
  });

  app.get("/api/performance/metrics", async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    res.json({
      capturedAt: new Date().toISOString(),
      metrics: getPerformanceMetrics(),
      activityMetrics: getPerformanceActivityMetrics(),
      history: getPerformanceHistory(),
    });
  });

  app.post("/api/performance/metrics/reset", async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    resetPerformanceMetrics();
    res.sendStatus(204);
  });

  app.get(api.auditLogs.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    try {
      const action = String(req.query.action || "all");
      const actionGroup = String(req.query.actionGroup || "all");
      const actorRole = String(req.query.actorRole || "all");
      const search = String(req.query.search || "");
      const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined;
      const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined;
      const electionId = req.query.electionId ? Number(req.query.electionId) : undefined;
      const page = Math.max(1, Number(req.query.page || 1));
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
      const logs = await storage.getAuditLogs({ action, actionGroup, actorRole, search, dateFrom, dateTo, electionId, page, pageSize });
      res.json({
        items: logs.items,
        total: logs.total,
        page,
        pageSize,
      });
    } catch {
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get(api.auditLogs.export.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    try {
      const csv = await buildAuditCsv({
        action: String(req.query.action || "all"),
        actionGroup: String(req.query.actionGroup || "all"),
        actorRole: String(req.query.actorRole || "all"),
        search: String(req.query.search || ""),
        dateFrom: req.query.dateFrom ? new Date(String(req.query.dateFrom)) : undefined,
        dateTo: req.query.dateTo ? new Date(String(req.query.dateTo)) : undefined,
        electionId: req.query.electionId ? Number(req.query.electionId) : undefined,
      });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="audit-trail-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch {
      res.status(500).json({ message: "Failed to export audit logs" });
    }
  });

  app.post(api.auditLogs.exportCreate.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    const filters = {
      action: String(req.body?.action || "all"),
      actionGroup: String(req.body?.actionGroup || "all"),
      actorRole: String(req.body?.actorRole || "all"),
      search: String(req.body?.search || ""),
      dateFrom: req.body?.dateFrom ? new Date(String(req.body.dateFrom)) : undefined,
      dateTo: req.body?.dateTo ? new Date(String(req.body.dateTo)) : undefined,
      electionId: req.body?.electionId ? Number(req.body.electionId) : undefined,
    };

    const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    auditExportJobs.set(jobId, {
      id: jobId,
      status: "queued",
      csv: null,
      error: null,
      createdAt: Date.now(),
    });

    void (async () => {
      const job = auditExportJobs.get(jobId);
      if (!job) return;
      job.status = "running";
      try {
        job.csv = await buildAuditCsv(filters);
        job.status = "completed";
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Export failed";
      }
    })();

    res.status(202).json({ jobId, status: "queued" });
  });

  app.get(api.auditLogs.exportStatus.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    const job = auditExportJobs.get(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Export job not found" });
    }

    res.json({
      jobId: job.id,
      status: job.status,
      downloadPath: job.status === "completed"
        ? api.auditLogs.exportDownload.path.replace(":id", job.id)
        : null,
      error: job.error,
    });
  });

  app.get(api.auditLogs.exportDownload.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    const job = auditExportJobs.get(req.params.id);
    if (!job || job.status !== "completed" || !job.csv) {
      return res.status(404).json({ message: "Export file not ready" });
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="audit-trail-${job.id}.csv"`);
    res.send(job.csv);
  });

  app.get("/api/candidates/my", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!["voter", "candidate"].includes(req.user!.role)) {
      return res.status(403).json({ message: "Only registered voters have candidate dashboards." });
    }
    try {
      const entries = await storage.getCandidateApplicationsByUserId(req.user!.id);
      res.json(entries);
    } catch {
      res.status(500).json({ message: "Failed to load candidate dashboard" });
    }
  });

    app.delete(api.candidates.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    const id = parseInt(req.params.id);
    const existing = await storage.getCandidate(id);
    await storage.deleteCandidate(id);
    invalidateAnalytics();
    if (existing) {
      emitActivity("candidate_deleted", `Candidate removed: ${existing.name}`, {
        actor: req.user!.username,
        target: existing.name,
        scope: "candidates",
        status: "warning",
        meta: { electionId: existing.electionId },
      });
    }
    res.sendStatus(204);
  });

  // Get candidates by status (for admin candidate management)
  app.get("/api/candidates", async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const status = (req.query.status as string) || "pending";
    const search = String(req.query.search || "");
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 12)));
    const result = await storage.getCandidatesPage({ status, search, page, pageSize });
    res.json({
      items: result.items,
      total: result.total,
      page,
      pageSize,
    });
  });

  // === Voter Management Routes ===

  // Create voter manually (admin)
  app.post(api.voters.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    try {
      const input = api.voters.create.input.parse({
        ...req.body,
        username: String(req.body.username || "").toUpperCase(),
      });
      const existingRegNo = await storage.getUserByUsername(input.username);
      if (existingRegNo) {
        return res.status(409).json({ message: "Registration number already exists" });
      }
      const existingEmail = await storage.getUserByEmail(input.email);
      if (existingEmail) {
        return res.status(409).json({ message: "Email already exists" });
      }
      const hashedPassword = await hashPassword(input.password);
      const created = await storage.createUser({
        name: input.name,
        username: input.username,
        email: input.email,
        password: hashedPassword,
        role: "voter",
        isAdmin: false,
      });
      invalidateAnalytics();
      await storage.createAuditLog({
        actorId: req.user!.id,
        action: "VOTER_CREATED",
        targetUserId: created.id,
        details: JSON.stringify({ username: created.username, email: created.email }),
      });
      emitActivity("user_created", `User created: ${created.username}`, {
        actor: req.user!.username,
        target: created.username,
        scope: "users",
        status: "success",
        meta: { role: created.role },
      });
      res.status(201).json(toSafeUser(created));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      if (isUniqueViolation(err)) {
        return res.status(409).json({ message: "Registration number or email already exists" });
      }
      res.status(500).json({ message: "Failed to create voter" });
    }
  });

  // Get all users (admin list view)
  app.get(api.voters.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const search = String(req.query.search || "");
    const role = String(req.query.role || "all");
    const sort = String(req.query.sort || "created_desc");
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const voterResult = await storage.getVotersPage({ search, role, sort, page, pageSize });
    res.json({
      items: voterResult.items.map(toSafeUser),
      total: voterResult.total,
      counts: voterResult.counts,
      page,
      pageSize,
    });
  });

  // Get single manageable user (non-admin account)
  app.get(api.voters.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const voter = await storage.getVoter(id);
    if (!voter) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(toSafeUser(voter));
  });

  // Update manageable user (voter/analyst)
  app.patch(api.voters.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    try {
      const input = api.voters.update.input.parse({
        ...req.body,
        ...(req.body.username ? { username: String(req.body.username).toUpperCase() } : {}),
      });
      if (input.username) {
        const existingRegNo = await storage.getUserByUsername(input.username);
        if (existingRegNo && existingRegNo.id !== id) {
          return res.status(409).json({ message: "Registration number already exists" });
        }
      }
      if (input.email) {
        const existingEmail = await storage.getUserByEmail(input.email);
        if (existingEmail && existingEmail.id !== id) {
          return res.status(409).json({ message: "Email already exists" });
        }
      }
      const updated = await storage.updateVoter(id, input);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.createAuditLog({
        actorId: req.user!.id,
        action: "VOTER_UPDATED",
        targetUserId: updated.id,
        details: JSON.stringify({ username: updated.username, email: updated.email }),
      });
      invalidateAnalytics();
      emitActivity("user_updated", `User updated: ${updated.username}`, {
        actor: req.user!.username,
        target: updated.username,
        scope: "users",
        status: "info",
        meta: { role: updated.role },
      });
      res.json(toSafeUser(updated));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      res.status(404).json({ message: "User not found" });
    }
  });

  // Disable/enable manageable user login
  app.patch(api.voters.setStatus.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const { isDisabled } = req.body;

    if (typeof isDisabled !== "boolean") {
      return res.status(400).json({ message: "isDisabled must be a boolean" });
    }

    try {
      const updated = await storage.updateVoterStatus(id, isDisabled);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.createAuditLog({
        actorId: req.user!.id,
        action: isDisabled ? "VOTER_DISABLED" : "VOTER_ENABLED",
        targetUserId: updated.id,
      });
      invalidateAnalytics();
      emitActivity(isDisabled ? "user_disabled" : "user_enabled", `${updated.username} was ${isDisabled ? "disabled" : "enabled"}`, {
        actor: req.user!.username,
        target: updated.username,
        scope: "users",
        status: isDisabled ? "warning" : "success",
        meta: { role: updated.role },
      });
      res.json(toSafeUser(updated));
    } catch {
      res.status(404).json({ message: "User not found" });
    }
  });

  // Reset manageable user password
  app.patch(api.voters.resetPassword.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const schema = z.object({ password: z.string().min(6) });

    try {
      const { password } = schema.parse(req.body);
      const hashedPassword = await hashPassword(password);
      const updated = await storage.updateVoterPassword(id, hashedPassword);
      if (!updated) {
        return res.status(404).json({ message: "User not found" });
      }
      await storage.createAuditLog({
        actorId: req.user!.id,
        action: "VOTER_PASSWORD_RESET",
        targetUserId: updated.id,
      });
      emitActivity("password_reset", `Password reset for ${updated.username}`, {
        actor: req.user!.username,
        target: updated.username,
        scope: "users",
        status: "warning",
        meta: { role: updated.role },
      });
      res.json(toSafeUser(updated));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(404).json({ message: "User not found" });
    }
  });

  // Soft-delete manageable user (restorable)
  app.delete(api.voters.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const deleted = await storage.softDeleteVoter(id);
    if (!deleted) {
      return res.status(404).json({ message: "User not found" });
    }
    await storage.createAuditLog({
      actorId: req.user!.id,
      action: "VOTER_SOFT_DELETED",
      targetUserId: deleted.id,
    });
    invalidateAnalytics();
    emitActivity("user_soft_deleted", `${deleted.username} moved to recycle state`, {
      actor: req.user!.username,
      target: deleted.username,
      scope: "users",
      status: "warning",
      meta: { role: deleted.role },
    });
    res.sendStatus(204);
  });

  // Restore soft-deleted manageable user
  app.patch(api.voters.restore.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const restored = await storage.restoreVoter(id);
    if (!restored) {
      return res.status(404).json({ message: "User not found" });
    }
    await storage.createAuditLog({
      actorId: req.user!.id,
      action: "VOTER_RESTORED",
      targetUserId: restored.id,
    });
    invalidateAnalytics();
    emitActivity("user_restored", `${restored.username} was restored`, {
      actor: req.user!.username,
      target: restored.username,
      scope: "users",
      status: "success",
      meta: { role: restored.role },
    });
    res.json(toSafeUser(restored));
  });

  // Permanent delete manageable user
  app.delete(api.voters.permanentDelete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const userToDelete = await storage.getVoter(id);
    if (!userToDelete) {
      return res.status(404).json({ message: "User not found" });
    }
    await storage.permanentlyDeleteVoter(id);
    await storage.createAuditLog({
      actorId: req.user!.id,
      action: "VOTER_PERMANENTLY_DELETED",
      details: JSON.stringify({
        deletedUserId: id,
        username: userToDelete.username,
        email: userToDelete.email,
      }),
    });
    invalidateAnalytics();
    emitActivity("user_deleted", `${userToDelete.username} was permanently deleted`, {
      actor: req.user!.username,
      target: userToDelete.username,
      scope: "users",
      status: "error",
      meta: { role: userToDelete.role },
    });
    res.sendStatus(204);
  });

  // Update candidate status (approve / reject)
  app.patch("/api/candidates/:id/status", async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const { status, reviewNotes } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const normalizedReviewNotes = typeof reviewNotes === "string" ? reviewNotes.trim() : "";
    if (status === "rejected" && !normalizedReviewNotes) {
      return res.status(400).json({ message: "A rejection reason is required." });
    }
    const updated = await storage.updateCandidateStatus(id, status, normalizedReviewNotes || null);
    invalidateAnalytics();
    await logAuthenticatedAudit(req, status === "approved" ? "CANDIDATE_APPROVED" : status === "rejected" ? "CANDIDATE_REJECTED" : "CANDIDATE_REVIEW_UPDATED", {
      candidateId: id,
      reviewNotes: normalizedReviewNotes || null,
    });
    emitActivity("candidate_status_changed", `Candidate ${updated.name} marked ${status}`, {
      actor: req.user!.username,
      target: updated.name,
      scope: "candidates",
      status: status === "approved" ? "success" : status === "rejected" ? "warning" : "info",
      meta: { electionId: updated.electionId, status },
    });
    res.json(updated);
  });

  // === Voting Routes ===

  app.post(api.votes.cast.path, rateLimit({ windowMs: 60_000, max: 25, scope: "vote-cast" }), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (!["voter", "candidate"].includes(req.user!.role)) {
      await logAuthenticatedAudit(req, "VOTE_BLOCKED", { reason: "non_voter_role", role: req.user!.role });
      return res.status(403).json({ message: "Only registered voters can cast votes." });
    }
    
    // Only voters can vote? Admins usually shouldn't, but logic doesn't strictly forbid it.
    // Let's assume admins can vote if they are registered as users, but usually they are just admins.
    // For now, allow any authenticated user to vote.

    try {
      const input = api.votes.cast.input.parse(req.body);
      const vote = await storage.castVoteSafely({
        voterId: req.user!.id,
        electionId: input.electionId,
        candidateId: input.candidateId
      });
      await logAuthenticatedAudit(req, "VOTE_CAST", {
        electionId: input.electionId,
        candidateId: input.candidateId,
      });
      invalidateAnalytics();
      emitActivity("vote_cast", `Vote recorded in election ${input.electionId}`, {
        actor: req.user!.username,
        scope: "votes",
        status: "success",
        meta: { electionId: input.electionId, candidateId: input.candidateId },
      });
      broadcastRealtime("vote_cast", {
        electionId: input.electionId,
        candidateId: input.candidateId,
      });

      res.status(201).json(vote);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof VoteProcessingError) {
        await logAuthenticatedAudit(req, "VOTE_BLOCKED", { reason: err.message, electionId: req.body?.electionId });
        return res.status(err.statusCode).json({ message: err.message });
      }
      throw err;
    }
  });

  app.get(api.votes.mine.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const entries = await storage.getUserVoteProceedings(req.user!.id);
      res.json(entries);
    } catch {
      res.status(500).json({ message: "Failed to fetch vote history" });
    }
  });

  return httpServer;
}

function toCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(","),
    )
    .join("\n");
}

function isUniqueViolation(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505";
}

async function buildAuditCsv(filters: {
  action: string;
  actionGroup: string;
  actorRole: string;
  search: string;
  dateFrom?: Date;
  dateTo?: Date;
  electionId?: number;
}) {
  const pageSize = 1000;
  let page = 1;
  let total = 0;
  const items: Awaited<ReturnType<typeof storage.getAuditLogs>>["items"] = [];

  do {
    const batch = await storage.getAuditLogs({
      action: filters.action,
      actionGroup: filters.actionGroup,
      actorRole: filters.actorRole,
      search: filters.search,
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      electionId: filters.electionId,
      page,
      pageSize,
    });
    total = batch.total;
    items.push(...batch.items);
    page += 1;
  } while (items.length < total);

  return toCsv([
    ["id", "action", "actorName", "actorRole", "targetName", "createdAt", "details"],
    ...items.map((entry) => [
      String(entry.id),
      entry.action,
      entry.actorName,
      entry.actorRole,
      entry.targetName || "",
      entry.createdAt,
      entry.details ? JSON.stringify(entry.details) : "",
    ]),
  ]);
}
