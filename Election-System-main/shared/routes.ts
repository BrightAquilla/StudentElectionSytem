import { z } from 'zod';
import { ELECTION_POSITIONS, insertUserSchema, insertElectionSchema, insertCandidateSchema, insertVoteSchema, users, elections, candidates, votes, parties } from './schema';

const registrationNumberSchema = z
  .string()
  .regex(/^[A-Z]{2}\d{2}\/PU\/\d{5}\/\d{2}$/, "Registration number must match format like SB30/PU/40239/20");
const electionPositionSchema = z.enum(ELECTION_POSITIONS);

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
  conflict: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  parties: {
    list: {
      method: 'GET' as const,
      path: '/api/parties' as const,
      responses: {
        200: z.array(z.custom<typeof parties.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/parties' as const,
      input: z.object({
        code: z.string().min(2),
        name: z.string().min(2),
        symbol: z.string().min(1),
        manifesto: z.string().min(20),
      }),
      responses: {
        201: z.custom<typeof parties.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.unauthorized,
        409: errorSchemas.conflict,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/parties/:id' as const,
      input: z.object({
        code: z.string().min(2),
        name: z.string().min(2),
        symbol: z.string().min(1),
        manifesto: z.string().min(20),
      }),
      responses: {
        200: z.custom<typeof parties.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
        409: errorSchemas.conflict,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/parties/:id' as const,
      responses: {
        204: z.void(),
        403: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
  },
  auth: {
    register: {
      method: 'POST' as const,
      path: '/api/register' as const,
      input: z.object({
        name: z.string().min(2),
        username: registrationNumberSchema,
        email: z.string().email(),
        password: z.string().min(6),
        accountType: z.enum(["voter", "candidate"]).default("voter"),
        party: z.string().min(2).optional(),
        symbol: z.string().min(1).optional(),
        partyManifesto: z.string().min(10).optional(),
        candidateManifesto: z.string().min(20).optional(),
      }).superRefine((data, ctx) => {
        if (data.accountType !== "candidate") {
          return;
        }
        if (!data.party) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["party"], message: "Select a party." });
        }
        if (!data.symbol) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["symbol"], message: "Party symbol is required." });
        }
        if (!data.partyManifesto) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["partyManifesto"], message: "Party manifesto is required." });
        }
        if (!data.candidateManifesto) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["candidateManifesto"], message: "Candidate manifesto is required." });
        }
      }),
      responses: {
        201: z.object({ message: z.string() }),
        400: errorSchemas.validation,
        409: errorSchemas.conflict,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: z.object({
        username: z.string().min(1),
        password: z.string(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout' as const,
      responses: {
        200: z.void(),
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/user' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>().nullable(),
      },
    },
    updateProfile: {
      method: 'PATCH' as const,
      path: '/api/user/profile' as const,
      input: z.object({
        name: z.string().min(2).optional(),
        email: z.string().email().optional(),
        password: z.string().min(6).optional(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
        409: errorSchemas.conflict,
      },
    },
  },
  elections: {
    list: {
      method: 'GET' as const,
      path: '/api/elections' as const,
      responses: {
        200: z.array(z.custom<typeof elections.$inferSelect & { hasVoted?: boolean }>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/elections/:id' as const,
      responses: {
        200: z.custom<typeof elections.$inferSelect & { candidates: (typeof candidates.$inferSelect)[], hasVoted?: boolean }>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/elections' as const,
      input: insertElectionSchema.extend({
        position: electionPositionSchema,
      }),
      responses: {
        201: z.custom<typeof elections.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/elections/:id' as const,
      input: insertElectionSchema.partial().extend({
        position: electionPositionSchema.optional(),
      }),
      responses: {
        200: z.custom<typeof elections.$inferSelect>(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/elections/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    results: {
      method: 'GET' as const,
      path: '/api/elections/:id/results' as const,
      responses: {
        200: z.custom<typeof elections.$inferSelect & { candidates: ((typeof candidates.$inferSelect) & { voteCount: number })[], totalVotes: number }>(),
        404: errorSchemas.notFound,
      },
    }
  },
  analytics: {
    get: {
      method: 'GET' as const,
      path: '/api/analytics' as const,
      responses: {
        200: z.object({
          totalVoters: z.number(),
          totalElections: z.number(),
          totalVotesCast: z.number(),
          activeElections: z.number(),
        }),
        403: errorSchemas.unauthorized,
      },
    },
    proceedings: {
      method: 'GET' as const,
      path: '/api/analytics/proceedings' as const,
      responses: {
        200: z.object({
          totals: z.object({
            totalVoters: z.number(),
            totalElections: z.number(),
            totalVotesCast: z.number(),
            activeElections: z.number(),
          }),
          byPosition: z.array(
            z.object({
              position: z.string(),
              electionId: z.number(),
              electionTitle: z.string(),
              status: z.string(),
              totalVotes: z.number(),
              candidates: z.array(
                z.object({
                  candidateId: z.number(),
                  candidateName: z.string(),
                  voteCount: z.number(),
                  party: z.string().nullable(),
                  symbol: z.string().nullable(),
                  color: z.string(),
                }),
              ),
            }),
          ),
          votesByElection: z.array(
            z.object({
              electionId: z.number(),
              electionTitle: z.string(),
              position: z.string(),
              status: z.string(),
              votes: z.number(),
            }),
          ),
          turnoutTimeline: z.array(
            z.object({
              bucket: z.string(),
              votes: z.number(),
            }),
          ),
          turnoutByPhase: z.array(
            z.object({
              phase: z.string(),
              votes: z.number(),
            }),
          ),
        }),
        401: errorSchemas.unauthorized,
      },
    },
  },
  auditLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/audit-logs' as const,
      responses: {
        200: z.object({
          items: z.array(
            z.object({
              id: z.number(),
              action: z.string(),
              actorId: z.number(),
              actorName: z.string(),
              actorRole: z.string(),
              targetUserId: z.number().nullable(),
              targetName: z.string().nullable(),
              details: z.record(z.unknown()).nullable(),
              createdAt: z.string(),
            }),
          ),
          total: z.number(),
          page: z.number(),
          pageSize: z.number(),
        }),
        403: errorSchemas.unauthorized,
      },
    },
    export: {
      method: 'GET' as const,
      path: '/api/audit-logs/export' as const,
      responses: {
        200: z.string(),
        403: errorSchemas.unauthorized,
      },
    },
    exportCreate: {
      method: 'POST' as const,
      path: '/api/audit-logs/export-jobs' as const,
      responses: {
        202: z.object({
          jobId: z.string(),
          status: z.enum(['queued', 'running']),
        }),
        403: errorSchemas.unauthorized,
      },
    },
    exportStatus: {
      method: 'GET' as const,
      path: '/api/audit-logs/export-jobs/:id' as const,
      responses: {
        200: z.object({
          jobId: z.string(),
          status: z.enum(['queued', 'running', 'completed', 'failed']),
          downloadPath: z.string().nullable(),
          error: z.string().nullable(),
        }),
        403: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
    exportDownload: {
      method: 'GET' as const,
      path: '/api/audit-logs/export-jobs/:id/download' as const,
      responses: {
        200: z.string(),
        403: errorSchemas.unauthorized,
        404: errorSchemas.notFound,
      },
    },
  },
  candidates: {
    create: {
      method: 'POST' as const,
      path: '/api/candidates' as const,
      input: insertCandidateSchema,
      responses: {
        201: z.custom<typeof candidates.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.unauthorized,
      },
    },
    mine: {
      method: 'GET' as const,
      path: '/api/candidates/my' as const,
      responses: {
        200: z.array(
          z.object({
            candidateId: z.number(),
            electionId: z.number(),
            electionTitle: z.string(),
            electionPosition: z.string(),
            electionStatus: z.string(),
            candidateName: z.string(),
            party: z.string().nullable(),
            partyManifesto: z.string().nullable(),
            candidateManifesto: z.string().nullable(),
            applicationStatus: z.string(),
            reviewNotes: z.string().nullable(),
            reviewedAt: z.string().nullable(),
            voteCount: z.number(),
            rank: z.number().nullable(),
            leaderName: z.string().nullable(),
            leaderVotes: z.number(),
          }),
        ),
        401: errorSchemas.unauthorized,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/candidates/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
  },
  votes: {
    cast: {
      method: 'POST' as const,
      path: '/api/votes' as const,
      input: z.object({
        electionId: z.number(),
        candidateId: z.number(),
      }),
      responses: {
        201: z.custom<typeof votes.$inferSelect>(),
        400: errorSchemas.validation, // e.g. already voted
        403: errorSchemas.unauthorized,
      },
    },
    mine: {
      method: 'GET' as const,
      path: '/api/votes/my' as const,
      responses: {
        200: z.array(
          z.object({
            voteId: z.number(),
            votedAt: z.string(),
            electionId: z.number(),
            electionTitle: z.string(),
            electionPosition: z.string(),
            electionStatus: z.string(),
            electionStartDate: z.string(),
            electionEndDate: z.string(),
            electionProgressPercent: z.number(),
            totalVotes: z.number(),
            myCandidate: z.object({
              candidateId: z.number(),
              candidateName: z.string(),
              party: z.string().nullable(),
              voteCount: z.number(),
              rank: z.number(),
            }),
            leader: z.object({
              candidateId: z.number(),
              candidateName: z.string(),
              party: z.string().nullable(),
              voteCount: z.number(),
            }).nullable(),
          }),
        ),
        401: errorSchemas.unauthorized,
      },
    },
  },
  voters: {
    create: {
      method: 'POST' as const,
      path: '/api/voters' as const,
      input: z.object({
        name: z.string().min(2),
        username: registrationNumberSchema,
        email: z.string().email(),
        password: z.string().min(6),
      }),
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.unauthorized,
        409: errorSchemas.conflict,
      },
    },
    list: {
      method: 'GET' as const,
      path: '/api/voters' as const,
      responses: {
        200: z.object({
          items: z.array(z.custom<typeof users.$inferSelect>()),
          total: z.number(),
          counts: z.object({
            total: z.number(),
            voter: z.number(),
            analyst: z.number(),
            admin: z.number(),
            disabled: z.number(),
          }),
          page: z.number(),
          pageSize: z.number(),
        }),
        403: errorSchemas.unauthorized,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/voters/:id' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/voters/:id' as const,
      input: z.object({
        name: z.string().min(2).optional(),
        username: registrationNumberSchema.optional(),
        email: z.string().email().optional(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    setStatus: {
      method: 'PATCH' as const,
      path: '/api/voters/:id/status' as const,
      input: z.object({
        isDisabled: z.boolean(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    resetPassword: {
      method: 'PATCH' as const,
      path: '/api/voters/:id/password' as const,
      input: z.object({
        password: z.string().min(6),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    softDelete: {
      method: 'PATCH' as const,
      path: '/api/voters/:id/soft-delete' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    restore: {
      method: 'PATCH' as const,
      path: '/api/voters/:id/restore' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    permanentDelete: {
      method: 'DELETE' as const,
      path: '/api/voters/:id/permanent' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/voters/:id' as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
        403: errorSchemas.unauthorized,
      },
    },
  },
};

// ============================================
// HELPER FUNCTIONS
// ============================================
export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
