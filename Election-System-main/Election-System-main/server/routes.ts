import type { Express } from "express";
import type { Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import express from "express";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
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
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    const id = parseInt(req.params.id);
    const results = await storage.getElectionResults(id);
    
    if (!results) {
      return res.status(404).json({ message: "Election not found" });
    }

    res.json(results);
  });

  app.get(api.analytics.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    try {
      const analytics = await storage.getSystemAnalytics();
      res.json(analytics);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // === Candidate Routes ===

  app.post(api.candidates.create.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);

    try {
      const input = api.candidates.create.input.parse(req.body);
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

  // Get all voters
  app.get(api.voters.list.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const voters = await storage.getVoters();
    res.json(voters);
  });

  // Get single voter
  app.get(api.voters.get.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const voter = await storage.getVoter(id);
    if (!voter) {
      return res.status(404).json({ message: "Voter not found" });
    }
    res.json(voter);
  });

  // Update voter
  app.patch(api.voters.update.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    const { name, username } = req.body;
    try {
      const updated = await storage.updateVoter(id, { name, username });
      res.json(updated);
    } catch (err) {
      res.status(404).json({ message: "Voter not found" });
    }
  });

  // Delete voter
  app.delete(api.voters.delete.path, async (req, res) => {
    if (!req.isAuthenticated() || !req.user!.isAdmin) return res.sendStatus(403);
    const id = parseInt(req.params.id);
    await storage.deleteVoter(id);
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
      
      const now = new Date();
      if (now < election.startDate || now > election.endDate) {
        return res.status(400).json({ message: "Election is not currently active." });
      }

      const vote = await storage.castVote({
        voterId: req.user!.id,
        electionId: input.electionId,
        candidateId: input.candidateId
      });

      res.status(201).json(vote);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  return httpServer;
}