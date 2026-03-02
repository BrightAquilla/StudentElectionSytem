import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 60),
  min: Number(process.env.DB_POOL_MIN || 5),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  query_timeout: 10_000,
  statement_timeout: 10_000,
  keepAlive: true,
  maxUses: 7_500,
  application_name: "student-election-system",
  allowExitOnIdle: false,
});
export const db = drizzle(pool, { schema });
