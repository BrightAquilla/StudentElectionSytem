import type { Express } from "express";
import type { Server } from "http";
import { hashPassword, setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import express from "express";
import { broadcastRealtime } from "./realtime";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const toSafeUser = (user: { id: number; username: string; email: string; name: string; role: string; isAdmin: boolean; isDisabled: boolean; deletedAt: Date | null; createdAt: Date | null; }) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    role: user.role,
    isAdmin: user.isAdmin,
    isDisabled: user.isDisabled,
    deletedAt: user.deletedAt,
    createdAt: user.createdAt,
  });

  // Setup Authentication
  setupAuth(app);

  // Increase body size limit to support base64 image uploads
  app.use(express.json({ limit: "10mb" }));

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
      const updated = await storage.updateElection(id, input);
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
    await storage.deleteElection(id);
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

  app.post(api.candidates.create.path, async (req, res) => {
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
      res.status(201).json(candidate);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Voter applies as candidate (status starts as "pending")
  app.post("/api/candidates/apply", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.isAdmin) return res.status(403).json({ message: "Admins cannot apply as candidates" });

    try {
      const { electionId, name, party, symbol, platform } = req.body;
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

      const candidate = await storage.createCandidate({
        electionId: Number(electionId),
        name,
        party: party || null,
        symbol: symbol || null,
        platform: platform || null,
        status: "pending",
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
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update candidate" });
    }
  });

    app.delete(api.candidates.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    const id = parseInt(req.params.id);
    await storage.deleteCandidate(id);
    res.sendStatus(204);
  });

  // Get candidates by status (for admin candidate management)
  app.get("/api/candidates", async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const status = (req.query.status as string) || "pending";
    const candidates = await storage.getCandidatesByStatus(status);
    res.json(candidates);
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
      await storage.createAuditLog({
        actorId: req.user!.id,
        action: "VOTER_CREATED",
        targetUserId: created.id,
        details: JSON.stringify({ username: created.username, email: created.email }),
      });
      res.status(201).json(toSafeUser(created));
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message, details: err.errors });
      }
      res.status(500).json({ message: "Failed to create voter" });
    }
  });

  // Get all users (admin list view)
  app.get(api.voters.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const voters = await storage.getVoters();
    res.json(voters.map(toSafeUser));
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
    res.sendStatus(204);
  });

  // Update candidate status (approve / reject)
  app.patch("/api/candidates/:id/status", async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const { status } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const updated = await storage.updateCandidateStatus(id, status);
    res.json(updated);
  });

  // === Voting Routes ===

  app.post(api.votes.cast.path, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    if (req.user!.role !== "voter") {
      return res.status(403).json({ message: "Only registered voters can cast votes." });
    }
    
    // Only voters can vote? Admins usually shouldn't, but logic doesn't strictly forbid it.
    // Let's assume admins can vote if they are registered as users, but usually they are just admins.
    // For now, allow any authenticated user to vote.

    try {
      const input = api.votes.cast.input.parse(req.body);
      
      const hasVoted = await storage.hasUserVoted(req.user!.id, input.electionId);
      if (hasVoted) {
        return res.status(400).json({ message: "You have already voted in this election." });
      }

      // Verify election is open
      const election = await storage.getElection(input.electionId);
      if (!election || !election.isPublished) {
        return res.status(400).json({ message: "Election is not open." });
      }

      const registeredVoters = await storage.getRegisteredVoterCount();
      const electionVotes = await storage.getElectionVoteCount(input.electionId);
      if (electionVotes >= registeredVoters) {
        return res.status(400).json({ message: "Vote limit reached for this election." });
      }
      
      const now = new Date();
      if (now < election.startDate || now > election.endDate) {
        return res.status(400).json({ message: "Election is not currently active." });
      }

      const vote = await storage.castVote({
        voterId: req.user!.id,
        electionId: input.electionId,
        candidateId: input.candidateId
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
