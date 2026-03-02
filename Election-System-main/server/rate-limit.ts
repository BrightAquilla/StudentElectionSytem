import type { Request, Response, NextFunction } from "express";
import { pool } from "./db";

type RateLimitOptions = {
  windowMs: number;
  max: number;
  scope: string;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let accessCounter = 0;

function getClientKey(req: Request, scope: string): string {
  const sessionKey = (req.user && "id" in req.user) ? `user:${req.user.id}` : null;
  const ipKey = req.ip || req.socket.remoteAddress || "unknown";
  return `${scope}:${sessionKey ?? `ip:${ipKey}`}`;
}

export function rateLimit(options: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (++accessCounter % 250 === 0 || buckets.size > 5_000) {
      pruneExpiredBuckets();
    }

    const now = Date.now();
    const key = getClientKey(req, options.scope);
    const useDbBackedLimiter = process.env.RATE_LIMIT_STORE !== "memory";

    try {
      if (useDbBackedLimiter) {
        const result = await consumeDatabaseToken(key, options.windowMs, options.max);
        res.setHeader("X-RateLimit-Limit", String(options.max));
        res.setHeader("X-RateLimit-Remaining", String(result.remaining));
        if (!result.allowed) {
          res.setHeader("Retry-After", String(result.retryAfterSeconds));
          return res.status(429).json({
            message: "Too many requests. Please slow down and try again shortly.",
          });
        }
        return next();
      }

      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= now) {
        buckets.set(key, {
          count: 1,
          resetAt: now + options.windowMs,
        });
        res.setHeader("X-RateLimit-Limit", String(options.max));
        res.setHeader("X-RateLimit-Remaining", String(Math.max(0, options.max - 1)));
        return next();
      }

      if (existing.count >= options.max) {
        const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
        res.setHeader("Retry-After", String(retryAfterSeconds));
        return res.status(429).json({
          message: "Too many requests. Please slow down and try again shortly.",
        });
      }

      res.setHeader("X-RateLimit-Limit", String(options.max));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, options.max - existing.count - 1)));
      existing.count += 1;
      buckets.set(key, existing);
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function pruneExpiredBuckets() {
  const now = Date.now();
  buckets.forEach((bucket, key) => {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  });
}

async function consumeDatabaseToken(key: string, windowMs: number, max: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (accessCounter % 500 === 0) {
      await client.query("DELETE FROM rate_limit_buckets WHERE reset_at <= NOW()");
    }
    const result = await client.query<{
      count: number;
      resetAt: Date;
    }>(
      `
        INSERT INTO rate_limit_buckets (key, count, reset_at)
        VALUES ($1, 1, NOW() + ($2::text || ' milliseconds')::interval)
        ON CONFLICT (key) DO UPDATE
        SET count = CASE
              WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
              ELSE rate_limit_buckets.count + 1
            END,
            reset_at = CASE
              WHEN rate_limit_buckets.reset_at <= NOW() THEN NOW() + ($2::text || ' milliseconds')::interval
              ELSE rate_limit_buckets.reset_at
            END
        RETURNING count, reset_at as "resetAt"
      `,
      [key, windowMs],
    );
    await client.query("COMMIT");

    const row = result.rows[0];
    const remaining = Math.max(0, max - row.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - Date.now()) / 1000));
    return {
      allowed: row.count <= max,
      remaining,
      retryAfterSeconds,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
