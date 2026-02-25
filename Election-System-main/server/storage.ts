import { db } from "./db";
import type { Store } from "express-session";
import {
  users, elections, candidates, votes, auditLogs,
  type User, type InsertUser,
  type Election, type InsertElection, type UpdateElectionRequest,
  type Candidate, type InsertCandidate,
  type Vote, type InsertVote,
  type ElectionWithCandidates,
  type ElectionResults
} from "@shared/schema";
import { eq, and, sql, desc, ne } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByEmailVerificationToken(token: string): Promise<User | undefined>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: {
    name?: string;
    email?: string;
    emailVerified?: boolean;
    emailVerificationToken?: string | null;
    emailVerificationExpires?: Date | null;
    passwordResetToken?: string | null;
    passwordResetExpires?: Date | null;
  }): Promise<User | undefined>;
  updateUserPassword(id: number, hashedPassword: string): Promise<User | undefined>;
  
  // Voters (for admin management)
  getVoters(): Promise<User[]>;
  getVoter(id: number): Promise<User | undefined>;
  updateVoter(id: number, data: { name?: string; username?: string; email?: string }): Promise<User>;
  updateVoterStatus(id: number, isDisabled: boolean): Promise<User>;
  updateVoterPassword(id: number, hashedPassword: string): Promise<User>;
  softDeleteVoter(id: number): Promise<User>;
  restoreVoter(id: number): Promise<User>;
  permanentlyDeleteVoter(id: number): Promise<void>;
  deleteVoter(id: number): Promise<void>;
  createAuditLog(entry: { actorId: number; action: string; targetUserId?: number; details?: string }): Promise<void>;

  // Elections
  getElections(): Promise<Election[]>;
  getElection(id: number): Promise<Election | undefined>;
  getElectionWithCandidates(id: number): Promise<ElectionWithCandidates | undefined>;
  createElection(election: InsertElection): Promise<Election>;
  updateElection(id: number, updates: UpdateElectionRequest): Promise<Election>;
  deleteElection(id: number): Promise<void>;

  // Candidates
  getCandidate(id: number): Promise<Candidate | undefined>;
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  findActiveCandidateByName(name: string, excludeElectionId?: number, excludeCandidateId?: number): Promise<(Candidate & { electionTitle: string; electionPosition: string }) | undefined>;
  deleteCandidate(id: number): Promise<void>;
  getCandidatesByElectionId(electionId: number): Promise<Candidate[]>;
  getCandidatesByStatus(status: string): Promise<(Candidate & { electionTitle: string })[]>;
  updateCandidateStatus(id: number, status: string): Promise<Candidate>;
  updateCandidate(id: number, data: { name?: string; party?: string | null; symbol?: string | null; platform?: string | null }): Promise<Candidate>;

  // Votes
  castVote(vote: InsertVote): Promise<Vote>;
  getRegisteredVoterCount(): Promise<number>;
  getElectionVoteCount(electionId: number): Promise<number>;
  getUserVoteProceedings(userId: number): Promise<{
    voteId: number;
    votedAt: string;
    electionId: number;
    electionTitle: string;
    electionPosition: string;
    electionStatus: string;
    electionStartDate: string;
    electionEndDate: string;
    electionProgressPercent: number;
    totalVotes: number;
    myCandidate: {
      candidateId: number;
      candidateName: string;
      party: string | null;
      voteCount: number;
      rank: number;
    };
    leader: {
      candidateId: number;
      candidateName: string;
      party: string | null;
      voteCount: number;
    } | null;
  }[]>;
  hasUserVoted(userId: number, electionId: number): Promise<boolean>;
  getElectionResults(electionId: number): Promise<ElectionResults | undefined>;
  getSystemAnalytics(): Promise<{ totalVoters: number; totalElections: number; totalVotesCast: number; activeElections: number; totalCandidates: number }>;
  getProceedingsAnalytics(): Promise<{
    totals: { totalVoters: number; totalElections: number; totalVotesCast: number; activeElections: number };
    byPosition: {
      position: string;
      electionId: number;
      electionTitle: string;
      status: string;
      totalVotes: number;
      candidates: { candidateId: number; candidateName: string; voteCount: number; party: string | null; symbol: string | null; color: string }[];
    }[];
    votesByElection: {
      electionId: number;
      electionTitle: string;
      position: string;
      status: string;
      votes: number;
    }[];
    turnoutTimeline: { bucket: string; votes: number }[];
    turnoutByPhase: { phase: string; votes: number }[];
  }>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: Store | undefined;
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByEmailVerificationToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.emailVerificationToken, token));
    return user;
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: number, data: {
    name?: string;
    email?: string;
    emailVerified?: boolean;
    emailVerificationToken?: string | null;
    emailVerificationExpires?: Date | null;
    passwordResetToken?: string | null;
    passwordResetExpires?: Date | null;
  }): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async updateUserPassword(id: number, hashedPassword: string): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ password: hashedPassword })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  // Voters Management
  async getVoters(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getVoter(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.isAdmin, false), ne(users.role, "admin")));
    return user;
  }

  async updateVoter(id: number, data: { name?: string; username?: string; email?: string }): Promise<User> {
    const [updated] = await db.update(users)
      .set(data)
      .where(and(eq(users.id, id), eq(users.isAdmin, false), ne(users.role, "admin")))
      .returning();
    return updated;
  }

  async updateVoterStatus(id: number, isDisabled: boolean): Promise<User> {
    const [updated] = await db.update(users)
      .set({ isDisabled })
      .where(and(eq(users.id, id), eq(users.isAdmin, false), ne(users.role, "admin")))
      .returning();
    return updated;
  }

  async updateVoterPassword(id: number, hashedPassword: string): Promise<User> {
    const [updated] = await db.update(users)
      .set({ password: hashedPassword })
      .where(and(eq(users.id, id), eq(users.isAdmin, false), ne(users.role, "admin")))
      .returning();
    return updated;
  }

  async softDeleteVoter(id: number): Promise<User> {
    const [updated] = await db.update(users)
      .set({ deletedAt: new Date(), isDisabled: true })
      .where(and(eq(users.id, id), eq(users.isAdmin, false), ne(users.role, "admin")))
      .returning();
    return updated;
  }

  async restoreVoter(id: number): Promise<User> {
    const [updated] = await db.update(users)
      .set({ deletedAt: null, isDisabled: false })
      .where(and(eq(users.id, id), eq(users.isAdmin, false), ne(users.role, "admin")))
      .returning();
    return updated;
  }

  async permanentlyDeleteVoter(id: number): Promise<void> {
    // Prevent FK violations: clear audit references and dependent rows before deleting the user.
    await db.update(auditLogs)
      .set({ targetUserId: null })
      .where(eq(auditLogs.targetUserId, id));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, id));
    await db.delete(votes).where(eq(votes.voterId, id));
    await db.delete(users).where(and(eq(users.id, id), eq(users.isAdmin, false), ne(users.role, "admin")));
  }

  async deleteVoter(id: number): Promise<void> {
    await this.permanentlyDeleteVoter(id);
  }

  async createAuditLog(entry: { actorId: number; action: string; targetUserId?: number; details?: string }): Promise<void> {
    await db.insert(auditLogs).values({
      actorId: entry.actorId,
      action: entry.action,
      targetUserId: entry.targetUserId ?? null,
      details: entry.details ?? null,
    });
  }

  // Elections
  async getElections(): Promise<Election[]> {
    return await db.select().from(elections).orderBy(desc(elections.startDate));
  }

  async getElection(id: number): Promise<Election | undefined> {
    const [election] = await db.select().from(elections).where(eq(elections.id, id));
    return election;
  }

  async getElectionWithCandidates(id: number): Promise<ElectionWithCandidates | undefined> {
    const [election] = await db.select().from(elections).where(eq(elections.id, id));
    if (!election) return undefined;

    const electionCandidates = await db.select().from(candidates).where(eq(candidates.electionId, id));
    return { ...election, candidates: electionCandidates };
  }

  async createElection(insertElection: InsertElection): Promise<Election> {
    const [election] = await db.insert(elections).values(insertElection).returning();
    return election;
  }

  async updateElection(id: number, updates: UpdateElectionRequest): Promise<Election> {
    const [updated] = await db.update(elections)
      .set(updates)
      .where(eq(elections.id, id))
      .returning();
    return updated;
  }

  async deleteElection(id: number): Promise<void> {
    // Delete related records first (cascade manually if needed, or rely on DB cascade if set)
    // For safety, we'll delete votes and candidates first
    await db.delete(votes).where(eq(votes.electionId, id));
    await db.delete(candidates).where(eq(candidates.electionId, id));
    await db.delete(elections).where(eq(elections.id, id));
  }

  // Candidates
  async getCandidate(id: number): Promise<Candidate | undefined> {
    const [candidate] = await db.select().from(candidates).where(eq(candidates.id, id));
    return candidate;
  }

  async createCandidate(insertCandidate: InsertCandidate): Promise<Candidate> {
    const [candidate] = await db.insert(candidates).values(insertCandidate).returning();
    return candidate;
  }

  async findActiveCandidateByName(name: string, excludeElectionId?: number, excludeCandidateId?: number): Promise<(Candidate & { electionTitle: string; electionPosition: string }) | undefined> {
    const normalizedName = name.trim().toLowerCase().replace(/\s+/g, " ");
    const now = new Date();
    const rows = await db.execute(sql`
      SELECT 
        c.*,
        e.title as "electionTitle",
        e.position as "electionPosition"
      FROM candidates c
      INNER JOIN elections e ON e.id = c.election_id
      WHERE REGEXP_REPLACE(LOWER(TRIM(c.name)), '\s+', ' ', 'g') = ${normalizedName}
        AND COALESCE(c.status, 'approved') != 'rejected'
        AND e.end_date >= ${now}
        ${excludeElectionId ? sql`AND e.id != ${excludeElectionId}` : sql``}
        ${excludeCandidateId ? sql`AND c.id != ${excludeCandidateId}` : sql``}
      ORDER BY e.end_date DESC
      LIMIT 1
    `);
    return rows.rows[0] as (Candidate & { electionTitle: string; electionPosition: string }) | undefined;
  }

  async deleteCandidate(id: number): Promise<void> {
    await db.delete(votes).where(eq(votes.candidateId, id)); // Remove votes for this candidate first
    await db.delete(candidates).where(eq(candidates.id, id));
  }

  async getCandidatesByElectionId(electionId: number): Promise<Candidate[]> {
    return await db.select().from(candidates).where(eq(candidates.electionId, electionId));
  }

  async getCandidatesByStatus(status: string): Promise<(Candidate & { electionTitle: string })[]> {
    const rows = await db.execute(sql`
      SELECT 
        c.id, c.election_id as "electionId", c.name, c.platform,
        COALESCE(c.symbol, NULL) as symbol,
        COALESCE(c.party, NULL) as party,
        COALESCE(c.status, 'approved') as status,
        COALESCE(c.applied_at, c.created_at) as "appliedAt",
        c.created_at as "createdAt",
        e.title as "electionTitle"
      FROM candidates c
      INNER JOIN elections e ON c.election_id = e.id
      WHERE COALESCE(c.status, 'approved') = ${status}
      ORDER BY COALESCE(c.applied_at, c.created_at) DESC
    `);
    return rows.rows as (Candidate & { electionTitle: string })[];
  }

  async updateCandidateStatus(id: number, status: string): Promise<Candidate> {
    const result = await db.execute(sql`
      UPDATE candidates SET status = ${status} WHERE id = ${id} RETURNING *
    `);
    return result.rows[0] as Candidate;
  }


  async updateCandidate(id: number, data: { name?: string; party?: string | null; symbol?: string | null; platform?: string | null }): Promise<Candidate> {
    const [updated] = await db.update(candidates)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.party !== undefined && { party: data.party }),
        ...(data.symbol !== undefined && { symbol: data.symbol }),
        ...(data.platform !== undefined && { platform: data.platform }),
      })
      .where(eq(candidates.id, id))
      .returning();
    return updated;
  }

  // Votes
  async castVote(insertVote: InsertVote): Promise<Vote> {
    const [vote] = await db.insert(votes).values(insertVote).returning();
    return vote;
  }

  async getRegisteredVoterCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "voter"), sql`${users.deletedAt} IS NULL`));
    return Number(row.count);
  }

  async getElectionVoteCount(electionId: number): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(votes)
      .where(eq(votes.electionId, electionId));
    return Number(row.count);
  }

  async getUserVoteProceedings(userId: number): Promise<{
    voteId: number;
    votedAt: string;
    electionId: number;
    electionTitle: string;
    electionPosition: string;
    electionStatus: string;
    electionStartDate: string;
    electionEndDate: string;
    electionProgressPercent: number;
    totalVotes: number;
    myCandidate: {
      candidateId: number;
      candidateName: string;
      party: string | null;
      voteCount: number;
      rank: number;
    };
    leader: {
      candidateId: number;
      candidateName: string;
      party: string | null;
      voteCount: number;
    } | null;
  }[]> {
    const voteRows = await db.execute(sql`
      SELECT
        v.id as "voteId",
        v.created_at as "votedAt",
        e.id as "electionId",
        e.title as "electionTitle",
        e.position as "electionPosition",
        e.start_date as "electionStartDate",
        e.end_date as "electionEndDate",
        e.is_published as "isPublished",
        c.id as "candidateId",
        c.name as "candidateName",
        c.party as "candidateParty"
      FROM votes v
      INNER JOIN elections e ON e.id = v.election_id
      INNER JOIN candidates c ON c.id = v.candidate_id
      WHERE v.voter_id = ${userId}
      ORDER BY v.created_at DESC
    `);

    const now = new Date();
    const rows = voteRows.rows as {
      voteId: number;
      votedAt: Date | string;
      electionId: number;
      electionTitle: string;
      electionPosition: string;
      electionStartDate: Date | string;
      electionEndDate: Date | string;
      isPublished: boolean;
      candidateId: number;
      candidateName: string;
      candidateParty: string | null;
    }[];

    const enriched = await Promise.all(rows.map(async (row) => {
      const results = await this.getElectionResults(row.electionId);
      const sorted = [...(results?.candidates ?? [])].sort((a, b) => b.voteCount - a.voteCount);
      const leader = sorted[0];
      const myCandidateResult = sorted.find((candidate) => candidate.id === row.candidateId);
      const rank = myCandidateResult ? (sorted.findIndex((candidate) => candidate.id === row.candidateId) + 1) : sorted.length + 1;

      const startDate = new Date(row.electionStartDate);
      const endDate = new Date(row.electionEndDate);
      const totalDuration = endDate.getTime() - startDate.getTime();
      let electionProgressPercent = 0;
      if (totalDuration > 0) {
        if (now <= startDate) electionProgressPercent = 0;
        else if (now >= endDate) electionProgressPercent = 100;
        else electionProgressPercent = ((now.getTime() - startDate.getTime()) / totalDuration) * 100;
      }

      const isPublished = row.isPublished !== false;
      const isActive = now >= startDate && now <= endDate;
      const isUpcoming = now < startDate;
      const electionStatus = !isPublished ? "Inactive" : isActive ? "Active" : isUpcoming ? "Upcoming" : "Ended";

      return {
        voteId: row.voteId,
        votedAt: new Date(row.votedAt).toISOString(),
        electionId: row.electionId,
        electionTitle: row.electionTitle,
        electionPosition: row.electionPosition || "Unassigned",
        electionStatus,
        electionStartDate: startDate.toISOString(),
        electionEndDate: endDate.toISOString(),
        electionProgressPercent: Math.max(0, Math.min(100, Number(electionProgressPercent.toFixed(1)))),
        totalVotes: results?.totalVotes ?? 0,
        myCandidate: {
          candidateId: row.candidateId,
          candidateName: row.candidateName,
          party: row.candidateParty,
          voteCount: myCandidateResult?.voteCount ?? 0,
          rank,
        },
        leader: leader
          ? {
              candidateId: leader.id,
              candidateName: leader.name,
              party: leader.party ?? null,
              voteCount: leader.voteCount,
            }
          : null,
      };
    }));

    return enriched;
  }

  async hasUserVoted(userId: number, electionId: number): Promise<boolean> {
    const [vote] = await db.select()
      .from(votes)
      .where(and(eq(votes.voterId, userId), eq(votes.electionId, electionId)));
    return !!vote;
  }

  async getElectionResults(electionId: number): Promise<ElectionResults | undefined> {
    const election = await this.getElection(electionId);
    if (!election) return undefined;

    const electionCandidates = await this.getCandidatesByElectionId(electionId);
    
    // Get vote counts
    const candidatesWithVotes = await Promise.all(electionCandidates.map(async (candidate) => {
      const [result] = await db.select({ count: sql<number>`count(*)` })
        .from(votes)
        .where(eq(votes.candidateId, candidate.id));
      
      return {
        ...candidate,
        voteCount: Number(result.count)
      };
    }));

    const totalVotes = candidatesWithVotes.reduce((acc, curr) => acc + curr.voteCount, 0);

    return {
      ...election,
      candidates: candidatesWithVotes,
      totalVotes
    };
  }

  async getSystemAnalytics(): Promise<{ totalVoters: number; totalElections: number; totalVotesCast: number; activeElections: number; totalCandidates: number }> {
    const [voterCount] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "voter"), sql`${users.deletedAt} IS NULL`));
    const [electionCount] = await db.select({ count: sql<number>`count(*)` }).from(elections);
    const [voteCount] = await db.select({ count: sql<number>`count(DISTINCT ${votes.voterId})` }).from(votes);
    const [candidateCount] = await db.select({ count: sql<number>`count(*)` }).from(candidates);

    const now = new Date();
    const [activeCount] = await db.select({ count: sql<number>`count(*)` })
      .from(elections)
      .where(and(
        eq(elections.isPublished, true),
        sql`${elections.startDate} <= ${now}`,
        sql`${elections.endDate} >= ${now}`
      ));

    return {
      totalVoters: Number(voterCount.count),
      totalElections: Number(electionCount.count),
      totalVotesCast: Number(voteCount.count),
      activeElections: Number(activeCount.count),
      totalCandidates: Number(candidateCount.count),
    };
  }

  async getProceedingsAnalytics(): Promise<{
    totals: { totalVoters: number; totalElections: number; totalVotesCast: number; activeElections: number };
    byPosition: {
      position: string;
      electionId: number;
      electionTitle: string;
      status: string;
      totalVotes: number;
      candidates: { candidateId: number; candidateName: string; voteCount: number; party: string | null; symbol: string | null; color: string }[];
    }[];
    votesByElection: {
      electionId: number;
      electionTitle: string;
      position: string;
      status: string;
      votes: number;
    }[];
    turnoutTimeline: { bucket: string; votes: number }[];
    turnoutByPhase: { phase: string; votes: number }[];
  }> {
    const totals = await this.getSystemAnalytics();
    const electionsList = await this.getElections();
    const now = new Date();

    const byPosition: {
      position: string;
      electionId: number;
      electionTitle: string;
      status: string;
      totalVotes: number;
      candidates: { candidateId: number; candidateName: string; voteCount: number; party: string | null; symbol: string | null; color: string }[];
    }[] = [];
    const votesByElection: {
      electionId: number;
      electionTitle: string;
      position: string;
      status: string;
      votes: number;
    }[] = [];
    const turnoutByPhaseMap: Record<string, number> = { Active: 0, Upcoming: 0, Ended: 0, Inactive: 0 };
    const palette = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#8b5cf6", "#0ea5e9", "#d946ef", "#14b8a6"];

    const positionLatestMap = new Map<string, Election>();
    for (const election of electionsList) {
      const existing = positionLatestMap.get(election.position);
      if (!existing || new Date(election.startDate) > new Date(existing.startDate)) {
        positionLatestMap.set(election.position, election);
      }
    }

    for (const election of Array.from(positionLatestMap.values())) {
      const isPublished = election.isPublished !== false;
      const isActive = now >= election.startDate && now <= election.endDate;
      const isUpcoming = now < election.startDate;
      const status = !isPublished ? "inactive" : isActive ? "active" : isUpcoming ? "upcoming" : "ended";

      const results = await this.getElectionResults(election.id);
      const electionVotes = results?.totalVotes ?? 0;
      const coloredCandidates = (results?.candidates ?? []).map((candidate, idx) => ({
        candidateId: candidate.id,
        candidateName: candidate.name,
        voteCount: candidate.voteCount,
        party: candidate.party ?? null,
        symbol: candidate.symbol ?? null,
        color: palette[idx % palette.length],
      }));
      byPosition.push({
        position: election.position || "Unassigned",
        electionId: election.id,
        electionTitle: election.title || "Untitled Election",
        status: status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : status === "ended" ? "Ended" : "Inactive",
        totalVotes: electionVotes,
        candidates: coloredCandidates,
      });
      votesByElection.push({
        electionId: election.id,
        electionTitle: election.title || "Untitled Election",
        position: election.position || "Unassigned",
        status: status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : status === "ended" ? "Ended" : "Inactive",
        votes: electionVotes,
      });

      turnoutByPhaseMap[status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : status === "ended" ? "Ended" : "Inactive"] += electionVotes;
    }
    const timelineRows = await db.execute(sql`
      SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00') as bucket, count(*)::int as votes
      FROM votes
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    return {
      totals: {
        totalVoters: totals.totalVoters,
        totalElections: totals.totalElections,
        totalVotesCast: totals.totalVotesCast,
        activeElections: totals.activeElections,
      },
      byPosition,
      votesByElection,
      turnoutTimeline: timelineRows.rows as { bucket: string; votes: number }[],
      turnoutByPhase: [
        { phase: "Active", votes: turnoutByPhaseMap.Active },
        { phase: "Upcoming", votes: turnoutByPhaseMap.Upcoming },
        { phase: "Ended", votes: turnoutByPhaseMap.Ended },
        { phase: "Inactive", votes: turnoutByPhaseMap.Inactive },
      ],
    };
  }
}

export const storage = new DatabaseStorage();
