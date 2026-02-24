import { z } from 'zod';
import { insertUserSchema, insertElectionSchema, insertCandidateSchema, insertVoteSchema, users, elections, candidates, votes } from './schema';

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
  auth: {
    register: {
      method: 'POST' as const,
      path: '/api/register' as const,
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
        409: errorSchemas.conflict,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: z.object({
        username: z.string(),
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
      input: insertElectionSchema,
      responses: {
        201: z.custom<typeof elections.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.unauthorized,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/elections/:id' as const,
      input: insertElectionSchema.partial(),
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
  },
  voters: {
    list: {
      method: 'GET' as const,
      path: '/api/voters' as const,
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
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
        username: z.string().min(3).optional(),
      }),
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
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
