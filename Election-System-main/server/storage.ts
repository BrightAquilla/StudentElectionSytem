import { db, pool } from "./db";
import type { Store } from "express-session";
import {
  users, elections, candidates, votes, auditLogs, parties,
  type User, type InsertUser,
  type Party, type InsertParty,
  type Election, type InsertElection, type UpdateElectionRequest,
  type Candidate, type InsertCandidate,
  type Vote, type InsertVote,
  type ElectionWithCandidates,
  type ElectionResults
} from "@shared/schema";
import { eq, and, sql, desc, ne, asc } from "drizzle-orm";

export interface IStorage {
  getParties(): Promise<Party[]>;
  getPartyByCode(code: string): Promise<Party | undefined>;
  getParty(id: number): Promise<Party | undefined>;
  createParty(party: InsertParty): Promise<Party>;
  updateParty(id: number, party: InsertParty): Promise<Party | undefined>;
  deleteParty(id: number): Promise<boolean>;
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
  getVotersPage(options: {
    search?: string;
    role?: string;
    sort?: string;
    page: number;
    pageSize: number;
  }): Promise<{
    items: (User & { isCandidate?: boolean })[];
    total: number;
    counts: {
      total: number;
      voter: number;
      analyst: number;
      admin: number;
      candidate: number;
      disabled: number;
    };
  }>;
  getVoter(id: number): Promise<User | undefined>;
  updateVoter(id: number, data: { name?: string; username?: string; email?: string }): Promise<User>;
  updateVoterStatus(id: number, isDisabled: boolean): Promise<User>;
  updateVoterPassword(id: number, hashedPassword: string): Promise<User>;
  softDeleteVoter(id: number): Promise<User>;
  restoreVoter(id: number): Promise<User>;
  permanentlyDeleteVoter(id: number): Promise<void>;
  deleteVoter(id: number): Promise<void>;
  createAuditLog(entry: { actorId: number; action: string; targetUserId?: number; details?: string }): Promise<void>;
  getAuditLogs(options: {
    action?: string;
    actionGroup?: string;
    actorRole?: string;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    electionId?: number;
    page: number;
    pageSize: number;
  }): Promise<{
    items: {
      id: number;
      action: string;
      actorId: number;
      actorName: string;
      actorRole: string;
      targetUserId: number | null;
      targetName: string | null;
      details: Record<string, unknown> | null;
      createdAt: string;
    }[];
    total: number;
  }>;

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
  findActiveCandidateByUserId(userId: number, excludeElectionId?: number, excludeCandidateId?: number): Promise<(Candidate & { electionTitle: string; electionPosition: string }) | undefined>;
  deleteCandidate(id: number): Promise<void>;
  getCandidatesByElectionId(electionId: number): Promise<Candidate[]>;
  getCandidatesByStatus(status: string): Promise<(Candidate & { electionTitle: string })[]>;
  getCandidatesPage(options: {
    status: string;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{
    items: (Candidate & { electionTitle: string })[];
    total: number;
  }>;
  getCandidateApplicationsByUserId(userId: number): Promise<{
    candidateId: number;
    electionId: number;
    electionTitle: string;
    electionPosition: string;
    electionStatus: string;
    candidateName: string;
    party: string | null;
    partyManifesto: string | null;
    candidateManifesto: string | null;
    applicationStatus: string;
    reviewNotes: string | null;
    reviewedAt: string | null;
    voteCount: number;
    rank: number | null;
    leaderName: string | null;
    leaderVotes: number;
  }[]>;
  updateCandidateStatus(id: number, status: string, reviewNotes?: string | null): Promise<Candidate>;
  updateCandidate(id: number, data: { name?: string; party?: string | null; partyManifesto?: string | null; symbol?: string | null; platform?: string | null }): Promise<Candidate>;

  // Votes
  castVote(vote: InsertVote): Promise<Vote>;
  castVoteSafely(vote: InsertVote): Promise<Vote>;
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
  invalidateAnalyticsCache(): void;
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
  private readonly analyticsCache = new Map<string, { expiresAt: number; value: unknown }>();
  async getParties(): Promise<Party[]> {
    return await db.select().from(parties).orderBy(asc(parties.name));
  }

  async getPartyByCode(code: string): Promise<Party | undefined> {
    const [party] = await db.select().from(parties).where(eq(parties.code, code));
    return party;
  }

  async getParty(id: number): Promise<Party | undefined> {
    const [party] = await db.select().from(parties).where(eq(parties.id, id));
    return party;
  }

  async createParty(insertParty: InsertParty): Promise<Party> {
    const [party] = await db.insert(parties).values(insertParty).returning();
    return party;
  }

  async updateParty(id: number, update: InsertParty): Promise<Party | undefined> {
    const [party] = await db.update(parties).set(update).where(eq(parties.id, id)).returning();
    return party;
  }

  async deleteParty(id: number): Promise<boolean> {
    const result = await db.delete(parties).where(eq(parties.id, id)).returning({ id: parties.id });
    return result.length > 0;
  }

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

  async getVotersPage(options: {
    search?: string;
    role?: string;
    sort?: string;
    page: number;
    pageSize: number;
  }): Promise<{
    items: (User & { isCandidate?: boolean })[];
    total: number;
    counts: {
      total: number;
      voter: number;
      analyst: number;
      admin: number;
      candidate: number;
      disabled: number;
    };
  }> {
    const search = options.search?.trim().toLowerCase() ?? "";
    const role = options.role && options.role !== "all" ? options.role : null;
    const offset = (options.page - 1) * options.pageSize;
    const sortOrder = getUserSortSql(options.sort);

    const rows = await db.execute(sql`
      WITH filtered_users AS (
        SELECT
          u.id,
          u.username,
          u.email,
          u.password,
          u.email_verified as "emailVerified",
          u.email_verification_token as "emailVerificationToken",
          u.email_verification_expires as "emailVerificationExpires",
          u.password_reset_token as "passwordResetToken",
          u.password_reset_expires as "passwordResetExpires",
          u.role,
          u.is_admin as "isAdmin",
          u.is_disabled as "isDisabled",
          u.deleted_at as "deletedAt",
          u.name,
          u.created_at as "createdAt",
          (
            u.role = 'candidate'
            OR EXISTS (
              SELECT 1
              FROM candidates c
              WHERE c.user_id = u.id
                AND COALESCE(c.status, 'approved') != 'rejected'
            )
          ) as "isCandidate"
        FROM users u
        WHERE (
          ${search} = ''
          OR LOWER(u.name) LIKE ${`%${search}%`}
          OR LOWER(u.username) LIKE ${`%${search}%`}
          OR LOWER(u.email) LIKE ${`%${search}%`}
        )
        AND (
          ${role}::text IS NULL
          OR (${role} = 'candidate' AND (
            u.role = 'candidate'
            OR EXISTS (
              SELECT 1
              FROM candidates c
              WHERE c.user_id = u.id
                AND COALESCE(c.status, 'approved') != 'rejected'
            )
          ))
          OR (${role} = 'admin' AND (u.is_admin = TRUE OR u.role = 'admin'))
          OR (${role} <> 'admin' AND ${role} <> 'candidate' AND u.role = ${role})
        )
      )
      SELECT *,
        (SELECT COUNT(*)::int FROM filtered_users) as "totalCount"
      FROM filtered_users
      ORDER BY ${sortOrder}
      LIMIT ${options.pageSize}
      OFFSET ${offset}
    `);

    const countRows = await db.execute(sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE role = 'voter')::int as voter,
        COUNT(*) FILTER (WHERE role = 'analyst')::int as analyst,
        COUNT(*) FILTER (WHERE is_admin = TRUE OR role = 'admin')::int as admin,
        COUNT(DISTINCT u.id) FILTER (
          WHERE (
            u.role = 'candidate'
            OR EXISTS (
              SELECT 1
              FROM candidates c
              WHERE c.user_id = u.id
                AND COALESCE(c.status, 'approved') != 'rejected'
            )
          )
        )::int as candidate,
        COUNT(*) FILTER (WHERE is_disabled = TRUE OR deleted_at IS NOT NULL)::int as disabled
      FROM users u
    `);

    const typedRows = rows.rows as ((User & { isCandidate?: boolean }) & { totalCount: number })[];
    const countRow = countRows.rows[0] as {
      total: number;
      voter: number;
      analyst: number;
      admin: number;
      candidate: number;
      disabled: number;
    };

    return {
      items: typedRows.map(({ totalCount, ...row }) => row),
      total: typedRows[0]?.totalCount ?? 0,
      counts: {
        total: Number(countRow?.total ?? 0),
        voter: Number(countRow?.voter ?? 0),
        analyst: Number(countRow?.analyst ?? 0),
        admin: Number(countRow?.admin ?? 0),
        candidate: Number(countRow?.candidate ?? 0),
        disabled: Number(countRow?.disabled ?? 0),
      },
    };
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
    const current = await this.getVoter(id);
    const updateData: Partial<InsertUser> = { isDisabled };
    if (current && !isDisabled && current.role === "candidate" && current.candidateApprovalStatus === "pending") {
      updateData.candidateApprovalStatus = "approved";
    }
    const [updated] = await db.update(users)
      .set(updateData)
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

  async getAuditLogs(options: {
    action?: string;
    actionGroup?: string;
    actorRole?: string;
    search?: string;
    dateFrom?: Date;
    dateTo?: Date;
    electionId?: number;
    page: number;
    pageSize: number;
  }): Promise<{
    items: {
      id: number;
      action: string;
      actorId: number;
      actorName: string;
      actorRole: string;
      targetUserId: number | null;
      targetName: string | null;
      details: Record<string, unknown> | null;
      createdAt: string;
    }[];
    total: number;
  }> {
    const search = options.search?.trim().toLowerCase() ?? "";
    const searchQuery = search || null;
    const offset = (options.page - 1) * options.pageSize;
    const actionFilter = options.action && options.action !== "all" ? options.action : null;
    const actionGroupActions = getAuditActionsForGroup(options.actionGroup);
    const actorRoleFilter = options.actorRole && options.actorRole !== "all" ? options.actorRole : null;
    const dateFrom = options.dateFrom ?? null;
    const dateTo = options.dateTo ?? null;
    const electionNeedle = options.electionId ? `%"electionId":${options.electionId}%` : null;
    const actionGroupFilterSql = actionGroupActions.length
      ? sql`AND al.action IN (${sql.join(actionGroupActions.map((action) => sql`${action}`), sql`, `)})`
      : sql``;

    const rows = await db.execute(sql`
      WITH filtered_logs AS (
        SELECT
          al.id,
          al.action,
          al.actor_id as "actorId",
          actor.name as "actorName",
          actor.role as "actorRole",
          al.target_user_id as "targetUserId",
          target_user.name as "targetName",
          al.details,
          al.created_at as "createdAt"
        FROM audit_logs al
        INNER JOIN users actor ON actor.id = al.actor_id
        LEFT JOIN users target_user ON target_user.id = al.target_user_id
        WHERE (${actionFilter}::text IS NULL OR al.action = ${actionFilter})
          ${actionGroupFilterSql}
          AND (${actorRoleFilter}::text IS NULL OR actor.role = ${actorRoleFilter})
          AND (${dateFrom}::timestamp IS NULL OR al.created_at >= ${dateFrom})
          AND (${dateTo}::timestamp IS NULL OR al.created_at <= ${dateTo})
          AND (${electionNeedle}::text IS NULL OR COALESCE(al.details, '') LIKE ${electionNeedle})
          AND (
            ${search} = ''
            OR LOWER(al.action) LIKE ${`%${search}%`}
            OR LOWER(actor.name) LIKE ${`%${search}%`}
            OR LOWER(actor.role) LIKE ${`%${search}%`}
            OR LOWER(COALESCE(target_user.name, '')) LIKE ${`%${search}%`}
            OR (${searchQuery}::text IS NOT NULL AND to_tsvector('simple', COALESCE(al.details, '')) @@ websearch_to_tsquery('simple', ${searchQuery}))
          )
      )
      SELECT *,
        (SELECT COUNT(*)::int FROM filtered_logs) as "totalCount"
      FROM filtered_logs
      ORDER BY "createdAt" DESC
      LIMIT ${options.pageSize}
      OFFSET ${offset}
    `);

    const typedRows = rows.rows as {
      id: number;
      action: string;
      actorId: number;
      actorName: string;
      actorRole: string;
      targetUserId: number | null;
      targetName: string | null;
      details: string | null;
      createdAt: Date | string;
      totalCount: number;
    }[];

    return {
      items: typedRows.map((row) => ({
        id: row.id,
        action: row.action,
        actorId: row.actorId,
        actorName: row.actorName,
        actorRole: row.actorRole,
        targetUserId: row.targetUserId,
        targetName: row.targetName,
        details: row.details ? safeParseAuditDetails(row.details) : null,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
      total: typedRows[0]?.totalCount ?? 0,
    };
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

  async findActiveCandidateByUserId(userId: number, excludeElectionId?: number, excludeCandidateId?: number): Promise<(Candidate & { electionTitle: string; electionPosition: string }) | undefined> {
    const now = new Date();
    const rows = await db.execute(sql`
      SELECT
        c.*,
        e.title as "electionTitle",
        e.position as "electionPosition"
      FROM candidates c
      INNER JOIN elections e ON e.id = c.election_id
      WHERE c.user_id = ${userId}
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
        c.id, c.election_id as "electionId", c.user_id as "userId", c.name, c.platform,
        COALESCE(c.symbol, NULL) as symbol,
        COALESCE(c.party, NULL) as party,
        COALESCE(c.party_manifesto, NULL) as "partyManifesto",
        COALESCE(c.status, 'approved') as status,
        COALESCE(c.review_notes, NULL) as "reviewNotes",
        c.reviewed_at as "reviewedAt",
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

  async getCandidatesPage(options: {
    status: string;
    search?: string;
    page: number;
    pageSize: number;
  }): Promise<{
    items: (Candidate & { electionTitle: string })[];
    total: number;
  }> {
    const search = options.search?.trim().toLowerCase() ?? "";
    const offset = (options.page - 1) * options.pageSize;

    const rows = await db.execute(sql`
      WITH filtered_candidates AS (
        SELECT
          c.id,
          c.election_id as "electionId",
          c.user_id as "userId",
          c.name,
          c.platform,
          c.party_manifesto as "partyManifesto",
          c.symbol,
          c.party,
          COALESCE(c.status, 'approved') as status,
          c.review_notes as "reviewNotes",
          c.reviewed_at as "reviewedAt",
          c.applied_at as "appliedAt",
          c.created_at as "createdAt",
          e.title as "electionTitle"
        FROM candidates c
        INNER JOIN elections e ON c.election_id = e.id
        WHERE COALESCE(c.status, 'approved') = ${options.status}
          AND (
            ${search} = ''
            OR LOWER(c.name) LIKE ${`%${search}%`}
            OR LOWER(e.title) LIKE ${`%${search}%`}
            OR LOWER(COALESCE(c.party, '')) LIKE ${`%${search}%`}
          )
      )
      SELECT *,
        (SELECT COUNT(*)::int FROM filtered_candidates) as "totalCount"
      FROM filtered_candidates
      ORDER BY COALESCE("appliedAt", "createdAt") DESC
      LIMIT ${options.pageSize}
      OFFSET ${offset}
    `);

    const typedRows = rows.rows as ((Candidate & { electionTitle: string }) & { totalCount: number })[];
    return {
      items: typedRows.map(({ totalCount, ...row }) => row),
      total: typedRows[0]?.totalCount ?? 0,
    };
  }

  async getCandidateApplicationsByUserId(userId: number): Promise<{
    candidateId: number;
    electionId: number;
    electionTitle: string;
    electionPosition: string;
    electionStatus: string;
    candidateName: string;
    party: string | null;
    partyManifesto: string | null;
    candidateManifesto: string | null;
    applicationStatus: string;
    reviewNotes: string | null;
    reviewedAt: string | null;
    voteCount: number;
    rank: number | null;
    leaderName: string | null;
    leaderVotes: number;
  }[]> {
    const applied = await db.select().from(candidates).where(eq(candidates.userId, userId));
    const now = new Date();
    const rows = await Promise.all(applied.map(async (candidate) => {
      const election = await this.getElection(candidate.electionId);
      if (!election) return null;
      const results = await this.getElectionResults(candidate.electionId);
      const sorted = [...(results?.candidates ?? [])].sort((a, b) => b.voteCount - a.voteCount);
      const rank = sorted.findIndex((entry) => entry.id === candidate.id);
      const leader = sorted[0];
      const candidateVotes = sorted.find((entry) => entry.id === candidate.id)?.voteCount ?? 0;
      const electionStatus = !election.isPublished
        ? "Inactive"
        : now < election.startDate
          ? "Upcoming"
          : now > election.endDate
            ? "Ended"
            : "Active";

      return {
        candidateId: candidate.id,
        electionId: election.id,
        electionTitle: election.title,
        electionPosition: election.position,
        electionStatus,
        candidateName: candidate.name,
        party: candidate.party ?? null,
        partyManifesto: candidate.partyManifesto ?? null,
        candidateManifesto: candidate.platform ?? null,
        applicationStatus: candidate.status,
        reviewNotes: candidate.reviewNotes ?? null,
        reviewedAt: candidate.reviewedAt ? new Date(candidate.reviewedAt).toISOString() : null,
        voteCount: candidateVotes,
        rank: rank >= 0 ? rank + 1 : null,
        leaderName: leader?.name ?? null,
        leaderVotes: leader?.voteCount ?? 0,
      };
    }));

    return rows.filter((row): row is NonNullable<typeof row> => row !== null);
  }

  async updateCandidateStatus(id: number, status: string, reviewNotes?: string | null): Promise<Candidate> {
    const result = await db.execute(sql`
      UPDATE candidates
      SET
        status = ${status},
        review_notes = ${reviewNotes ?? null},
        reviewed_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    return result.rows[0] as Candidate;
  }


  async updateCandidate(id: number, data: { name?: string; party?: string | null; partyManifesto?: string | null; symbol?: string | null; platform?: string | null }): Promise<Candidate> {
    const [updated] = await db.update(candidates)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.party !== undefined && { party: data.party }),
        ...(data.partyManifesto !== undefined && { partyManifesto: data.partyManifesto }),
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

  async castVoteSafely(insertVote: InsertVote): Promise<Vote> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [insertVote.electionId]);

      const electionResult = await client.query<{
        id: number;
        is_published: boolean;
        start_date: Date;
        end_date: Date;
      }>(
        `
          SELECT id, is_published, start_date, end_date
          FROM elections
          WHERE id = $1
          FOR UPDATE
        `,
        [insertVote.electionId],
      );
      const election = electionResult.rows[0];
      if (!election || !election.is_published) {
        throw new VoteProcessingError("Election is not open.", 400);
      }

      const now = new Date();
      if (now < new Date(election.start_date) || now > new Date(election.end_date)) {
        throw new VoteProcessingError("Election is not currently active.", 400);
      }

      const candidateResult = await client.query<{ id: number }>(
        `
          SELECT id
          FROM candidates
          WHERE id = $1
            AND election_id = $2
            AND COALESCE(status, 'approved') = 'approved'
          LIMIT 1
        `,
        [insertVote.candidateId, insertVote.electionId],
      );
      if (!candidateResult.rows[0]) {
        throw new VoteProcessingError("Candidate is not available for this election.", 400);
      }

      const [{ count: registeredVotersCount }] = (
        await client.query<{ count: string }>(
          `
            SELECT COUNT(*)::text as count
            FROM users
            WHERE role IN ('voter', 'candidate')
              AND deleted_at IS NULL
          `,
        )
      ).rows;
      const [{ count: electionVotesCount }] = (
        await client.query<{ count: string }>(
          `
            SELECT COUNT(*)::text as count
            FROM votes
            WHERE election_id = $1
          `,
          [insertVote.electionId],
        )
      ).rows;

      if (Number(electionVotesCount) >= Number(registeredVotersCount)) {
        throw new VoteProcessingError("Vote limit reached for this election.", 400);
      }

      const inserted = await client.query<Vote>(
        `
          INSERT INTO votes (voter_id, election_id, candidate_id)
          VALUES ($1, $2, $3)
          RETURNING id, voter_id as "voterId", election_id as "electionId", candidate_id as "candidateId", created_at as "createdAt"
        `,
        [insertVote.voterId, insertVote.electionId, insertVote.candidateId],
      );

      await client.query("COMMIT");
      return inserted.rows[0];
    } catch (error: any) {
      await client.query("ROLLBACK");
      if (error?.code === "23505") {
        throw new VoteProcessingError("You have already voted in this election.", 400);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async getRegisteredVoterCount(): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(sql`${users.role} IN ('voter', 'candidate')`, sql`${users.deletedAt} IS NULL`));
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

    const rows = await db.execute(sql`
      SELECT
        c.id,
        c.election_id as "electionId",
        c.user_id as "userId",
        c.name,
        c.platform,
        c.party_manifesto as "partyManifesto",
        c.symbol,
        c.party,
        COALESCE(c.status, 'approved') as status,
        c.review_notes as "reviewNotes",
        c.reviewed_at as "reviewedAt",
        c.applied_at as "appliedAt",
        c.created_at as "createdAt",
        COUNT(v.id)::int as "voteCount"
      FROM candidates c
      LEFT JOIN votes v ON v.candidate_id = c.id
      WHERE c.election_id = ${electionId}
      GROUP BY c.id
      ORDER BY c.created_at ASC
    `);

    const candidatesWithVotes = rows.rows as (Candidate & { voteCount: number })[];

    const totalVotes = candidatesWithVotes.reduce((acc, curr) => acc + curr.voteCount, 0);

    return {
      ...election,
      candidates: candidatesWithVotes,
      totalVotes
    };
  }

  async getSystemAnalytics(): Promise<{ totalVoters: number; totalElections: number; totalVotesCast: number; activeElections: number; totalCandidates: number }> {
    const cached = this.readCached<{ totalVoters: number; totalElections: number; totalVotesCast: number; activeElections: number; totalCandidates: number }>("system-analytics");
    if (cached) return cached;

    const now = new Date();
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE role IN ('voter', 'candidate') AND deleted_at IS NULL) as "totalVoters",
        (SELECT COUNT(*)::int FROM elections) as "totalElections",
        (SELECT COUNT(DISTINCT voter_id)::int FROM votes) as "totalVotesCast",
        (SELECT COUNT(*)::int FROM elections WHERE is_published = TRUE AND start_date <= ${now} AND end_date >= ${now}) as "activeElections",
        (
          (
            SELECT COUNT(DISTINCT u.id)::int
            FROM users u
            WHERE u.deleted_at IS NULL
              AND (
                u.role = 'candidate'
                OR EXISTS (
                  SELECT 1
                  FROM candidates c
                  WHERE c.user_id = u.id
                    AND COALESCE(c.status, 'approved') != 'rejected'
                )
              )
          )
          +
          (
            SELECT COUNT(*)::int
            FROM candidates c
            WHERE c.user_id IS NULL
          )
        ) as "totalCandidates"
    `);
    const row = result.rows[0] as {
      totalVoters: number;
      totalElections: number;
      totalVotesCast: number;
      activeElections: number;
      totalCandidates: number;
    };

    const value = {
      totalVoters: Number(row.totalVoters ?? 0),
      totalElections: Number(row.totalElections ?? 0),
      totalVotesCast: Number(row.totalVotesCast ?? 0),
      activeElections: Number(row.activeElections ?? 0),
      totalCandidates: Number(row.totalCandidates ?? 0),
    };
    this.writeCached("system-analytics", value, 3_000);
    return value;
  }

  invalidateAnalyticsCache() {
    this.analyticsCache.clear();
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
    const cached = this.readCached<{
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
    }>("proceedings-analytics");
    if (cached) return cached;

    const totals = await this.getSystemAnalytics();
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

    const latestRows = await db.execute(sql`
      SELECT DISTINCT ON (position)
        id,
        title,
        position,
        start_date as "startDate",
        end_date as "endDate",
        is_published as "isPublished"
      FROM elections
      ORDER BY position, start_date DESC
    `);
    const latestElections = latestRows.rows as {
      id: number;
      title: string;
      position: string;
      startDate: Date;
      endDate: Date;
      isPublished: boolean;
    }[];

    if (latestElections.length > 0) {
      const electionIds = latestElections.map((election) => election.id);
      const aggregateRows = await db.execute(sql`
        SELECT
          e.id as "electionId",
          e.title as "electionTitle",
          e.position,
          e.start_date as "startDate",
          e.end_date as "endDate",
          e.is_published as "isPublished",
          c.id as "candidateId",
          c.name as "candidateName",
          c.party,
          c.symbol,
          COUNT(v.id)::int as "voteCount"
        FROM elections e
        LEFT JOIN candidates c ON c.election_id = e.id
        LEFT JOIN votes v ON v.candidate_id = c.id
        WHERE e.id IN (${sql.join(electionIds.map((id) => sql`${id}`), sql`, `)})
        GROUP BY e.id, c.id
        ORDER BY e.position ASC, c.created_at ASC NULLS LAST
      `);

      const rows = aggregateRows.rows as {
        electionId: number;
        electionTitle: string;
        position: string;
        startDate: Date;
        endDate: Date;
        isPublished: boolean;
        candidateId: number | null;
        candidateName: string | null;
        party: string | null;
        symbol: string | null;
        voteCount: number;
      }[];

      for (const election of latestElections) {
        const isPublished = election.isPublished !== false;
        const isActive = now >= election.startDate && now <= election.endDate;
        const isUpcoming = now < election.startDate;
        const status = !isPublished ? "inactive" : isActive ? "active" : isUpcoming ? "upcoming" : "ended";
        const electionRows = rows.filter((row) => row.electionId === election.id);
        const coloredCandidates = electionRows
          .filter((row) => row.candidateId !== null)
          .map((row, idx) => ({
            candidateId: row.candidateId as number,
            candidateName: row.candidateName as string,
            voteCount: Number(row.voteCount ?? 0),
            party: row.party ?? null,
            symbol: row.symbol ?? null,
            color: palette[idx % palette.length],
          }));
        const electionVotes = coloredCandidates.reduce((sum, candidate) => sum + candidate.voteCount, 0);
        const statusLabel = status === "active" ? "Active" : status === "upcoming" ? "Upcoming" : status === "ended" ? "Ended" : "Inactive";

        byPosition.push({
          position: election.position || "Unassigned",
          electionId: election.id,
          electionTitle: election.title || "Untitled Election",
          status: statusLabel,
          totalVotes: electionVotes,
          candidates: coloredCandidates,
        });
        votesByElection.push({
          electionId: election.id,
          electionTitle: election.title || "Untitled Election",
          position: election.position || "Unassigned",
          status: statusLabel,
          votes: electionVotes,
        });
        turnoutByPhaseMap[statusLabel] += electionVotes;
      }
    }
    const timelineRows = await db.execute(sql`
      SELECT to_char(date_trunc('hour', created_at), 'YYYY-MM-DD HH24:00') as bucket, count(*)::int as votes
      FROM votes
      WHERE created_at >= NOW() - INTERVAL '24 hours'
      GROUP BY 1
      ORDER BY 1 ASC
    `);

    const value = {
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
    this.writeCached("proceedings-analytics", value, 3_000);
    return value;
  }

  private readCached<T>(key: string): T | null {
    const entry = this.analyticsCache.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.analyticsCache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private writeCached(key: string, value: unknown, ttlMs: number) {
    this.analyticsCache.set(key, {
      expiresAt: Date.now() + ttlMs,
      value,
    });
  }
}

export const storage = new DatabaseStorage();

function safeParseAuditDetails(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : { value: parsed };
  } catch {
    return { raw: value };
  }
}

function getUserSortSql(sort?: string) {
  switch (sort) {
    case "created_asc":
      return sql`"createdAt" ASC`;
    case "name_asc":
      return sql`name ASC`;
    case "name_desc":
      return sql`name DESC`;
    case "role":
      return sql`
        CASE
          WHEN "isAdmin" = TRUE OR role = 'admin' THEN 0
          WHEN role = 'analyst' THEN 1
          ELSE 2
        END ASC,
        name ASC
      `;
    case "created_desc":
    default:
      return sql`"createdAt" DESC`;
  }
}

function getAuditActionsForGroup(group?: string) {
  switch (group) {
    case "candidate_review":
      return [
        "CANDIDATE_APPLICATION_SUBMITTED",
        "CANDIDATE_APPROVED",
        "CANDIDATE_REJECTED",
        "CANDIDATE_REVIEW_UPDATED",
      ];
    case "election_control":
      return [
        "ELECTION_PUBLISHED",
        "ELECTION_UNPUBLISHED",
      ];
    case "voting":
      return [
        "VOTE_BLOCKED",
        "VOTE_CAST",
      ];
    case "user_management":
      return [
        "VOTER_CREATED",
        "VOTER_UPDATED",
        "VOTER_DISABLED",
        "VOTER_ENABLED",
        "VOTER_PASSWORD_RESET",
        "VOTER_SOFT_DELETED",
        "VOTER_RESTORED",
        "VOTER_PERMANENTLY_DELETED",
      ];
    default:
      return [];
  }
}

export class VoteProcessingError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "VoteProcessingError";
  }
}
