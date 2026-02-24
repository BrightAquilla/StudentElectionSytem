import { db } from "./db";
import {
  users, elections, candidates, votes,
  type User, type InsertUser,
  type Election, type InsertElection, type UpdateElectionRequest,
  type Candidate, type InsertCandidate,
  type Vote, type InsertVote,
  type ElectionWithCandidates,
  type ElectionResults
} from "@shared/schema";
import { eq, and, sql, desc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Voters (for admin management)
  getVoters(): Promise<User[]>;
  getVoter(id: number): Promise<User | undefined>;
  updateVoter(id: number, data: { name?: string; username?: string }): Promise<User>;
  deleteVoter(id: number): Promise<void>;

  // Elections
  getElections(): Promise<Election[]>;
  getElection(id: number): Promise<Election | undefined>;
  getElectionWithCandidates(id: number): Promise<ElectionWithCandidates | undefined>;
  createElection(election: InsertElection): Promise<Election>;
  updateElection(id: number, updates: UpdateElectionRequest): Promise<Election>;
  deleteElection(id: number): Promise<void>;

  // Candidates
  createCandidate(candidate: InsertCandidate): Promise<Candidate>;
  deleteCandidate(id: number): Promise<void>;
  getCandidatesByElectionId(electionId: number): Promise<Candidate[]>;
  getCandidatesByStatus(status: string): Promise<(Candidate & { electionTitle: string })[]>;
  updateCandidateStatus(id: number, status: string): Promise<Candidate>;
  updateCandidate(id: number, data: { name?: string; party?: string | null; symbol?: string | null; platform?: string | null }): Promise<Candidate>;

  // Votes
  castVote(vote: InsertVote): Promise<Vote>;
  hasUserVoted(userId: number, electionId: number): Promise<boolean>;
  getElectionResults(electionId: number): Promise<ElectionResults | undefined>;
  getSystemAnalytics(): Promise<{ totalVoters: number; totalElections: number; totalVotesCast: number; activeElections: number; totalCandidates: number }>;
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

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  // Voters Management
  async getVoters(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.isAdmin, false)).orderBy(desc(users.createdAt));
  }

  async getVoter(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(and(eq(users.id, id), eq(users.isAdmin, false)));
    return user;
  }

  async updateVoter(id: number, data: { name?: string; username?: string }): Promise<User> {
    const [updated] = await db.update(users)
      .set(data)
      .where(and(eq(users.id, id), eq(users.isAdmin, false)))
      .returning();
    return updated;
  }

  async deleteVoter(id: number): Promise<void> {
    // First delete all votes by this user
    await db.delete(votes).where(eq(votes.voterId, id));
    // Then delete the user
    await db.delete(users).where(and(eq(users.id, id), eq(users.isAdmin, false)));
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
  async createCandidate(insertCandidate: InsertCandidate): Promise<Candidate> {
    const [candidate] = await db.insert(candidates).values(insertCandidate).returning();
    return candidate;
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
    const [voterCount] = await db.select({ count: sql<number>`count(*)` }).from(users).where(eq(users.isAdmin, false));
    const [electionCount] = await db.select({ count: sql<number>`count(*)` }).from(elections);
    const [voteCount] = await db.select({ count: sql<number>`count(*)` }).from(votes);
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
}

export const storage = new DatabaseStorage();