import { pool } from "./db";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log("[migrate] Running migrations...");

    // Add symbol column to candidates if it doesn't exist
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS symbol TEXT;
    `);

    // Add party column to candidates if it doesn't exist
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS party TEXT;
    `);

    // Add status column to candidates if it doesn't exist (default approved so existing candidates stay visible)
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
    `);

    // Add applied_at column to candidates if it doesn't exist
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP DEFAULT NOW();
    `);

    console.log("[migrate] Migrations complete.");
  } catch (err) {
    console.error("[migrate] Migration error:", err);
    throw err;
  } finally {
    client.release();
  }
}