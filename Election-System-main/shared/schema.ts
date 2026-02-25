import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const ELECTION_POSITIONS = [
  "President",
  "Vice President",
  "Secretary General",
  "Finance Secretary",
  "Academic Secretary",
  "Sports Secretary",
  "Gender Secretary",
] as const;

// === TABLE DEFINITIONS ===

// Users (Admins and Voters)
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  emailVerified: boolean("email_verified").default(true).notNull(),
  emailVerificationToken: text("email_verification_token"),
  emailVerificationExpires: timestamp("email_verification_expires"),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  role: text("role").notNull().default("voter"), // "admin" | "analyst" | "voter"
  isAdmin: boolean("is_admin").default(false).notNull(),
  isDisabled: boolean("is_disabled").default(false).notNull(),
  deletedAt: timestamp("deleted_at"),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Elections
export const elections = pgTable("elections", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  position: text("position").notNull().default("President"),
  description: text("description"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  isPublished: boolean("is_published").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Candidates — now includes symbol, party, and application status
export const candidates = pgTable("candidates", {
  id: serial("id").primaryKey(),
  electionId: integer("election_id").references(() => elections.id).notNull(),
  name: text("name").notNull(),
  platform: text("platform"),
  symbol: text("symbol"),          // e.g. "Tree", "Flower", "Star"
  party: text("party"),            // e.g. "Green Party", "Independent"
  status: text("status").notNull().default("approved"), // "pending" | "approved" | "rejected"
  appliedAt: timestamp("applied_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Votes
export const votes = pgTable("votes", {
  id: serial("id").primaryKey(),
  voterId: integer("voter_id").references(() => users.id).notNull(),
  electionId: integer("election_id").references(() => elections.id).notNull(),
  candidateId: integer("candidate_id").references(() => candidates.id).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  unqVote: uniqueIndex("unique_vote_idx").on(t.voterId, t.electionId),
}));

// Audit logs for privileged actions
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => users.id).notNull(),
  action: text("action").notNull(),
  targetUserId: integer("target_user_id").references(() => users.id),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// === RELATIONS ===

export const electionsRelations = relations(elections, ({ many }) => ({
  candidates: many(candidates),
  votes: many(votes),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  election: one(elections, {
    fields: [candidates.electionId],
    references: [elections.id],
  }),
  votes: many(votes),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  voter: one(users, {
    fields: [votes.voterId],
    references: [users.id],
  }),
  election: one(elections, {
    fields: [votes.electionId],
    references: [elections.id],
  }),
  candidate: one(candidates, {
    fields: [votes.candidateId],
    references: [candidates.id],
  }),
}));

// === BASE SCHEMAS ===

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertElectionSchema = createInsertSchema(elections).omit({ id: true, createdAt: true });
export const insertCandidateSchema = createInsertSchema(candidates).omit({ id: true, createdAt: true, appliedAt: true });
export const insertVoteSchema = createInsertSchema(votes).omit({ id: true, createdAt: true });

// === TYPES ===

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Election = typeof elections.$inferSelect;
export type InsertElection = z.infer<typeof insertElectionSchema>;
export type CreateElectionRequest = InsertElection;
export type UpdateElectionRequest = Partial<InsertElection>;

export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type CreateCandidateRequest = InsertCandidate;
export type CandidateStatus = "pending" | "approved" | "rejected";

export type Vote = typeof votes.$inferSelect;
export type InsertVote = z.infer<typeof insertVoteSchema>;
export type CastVoteRequest = { candidateId: number; electionId: number };

export interface ElectionWithCandidates extends Election {
  candidates: Candidate[];
  hasVoted?: boolean;
}

export interface ElectionResults extends Election {
  candidates: (Candidate & { voteCount: number })[];
  totalVotes: number;
}

export interface SystemAnalytics {
  totalVoters: number;
  totalElections: number;
  totalVotesCast: number;
  activeElections: number;
  totalCandidates: number;
}
