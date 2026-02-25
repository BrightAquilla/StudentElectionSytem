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

    // Add is_disabled column to users for account access control
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disabled BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires TIMESTAMP NULL;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP NULL;
    `);

    // Add email to users and backfill existing rows
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
    `);
    await client.query(`
      UPDATE users
      SET email = username || '@pwani.local'
      WHERE email IS NULL OR TRIM(email) = '';
    `);
    await client.query(`
      ALTER TABLE users ALTER COLUMN email SET NOT NULL;
    `);
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx ON users(email);
    `);

    // Add position to elections
    await client.query(`
      ALTER TABLE elections ADD COLUMN IF NOT EXISTS position TEXT;
    `);
    await client.query(`
      UPDATE elections SET position = 'President'
      WHERE position IS NULL OR TRIM(position) = '';
    `);
    // Normalize legacy position names to the current controlled list.
    await client.query(`
      UPDATE elections
      SET position = CASE
        WHEN position IN ('Vice president', 'VICE PRESIDENT') THEN 'Vice President'
        WHEN position = 'Faculty Representative' THEN 'Academic Secretary'
        WHEN position = 'Class Representative' THEN 'Secretary General'
        WHEN position = 'Sports Representative' THEN 'Sports Secretary'
        WHEN position = 'Entertainment Representative' THEN 'Gender Secretary'
        ELSE position
      END
      WHERE position IN (
        'Vice president',
        'VICE PRESIDENT',
        'Faculty Representative',
        'Class Representative',
        'Sports Representative',
        'Entertainment Representative'
      );
    `);
    await client.query(`
      ALTER TABLE elections ALTER COLUMN position SET NOT NULL;
    `);

    // Role-based permissions and soft-delete support
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'voter';
    `);
    await client.query(`
      UPDATE users SET role = 'admin' WHERE is_admin = TRUE;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users(deleted_at);
    `);

    // Audit log table for privileged actions
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        target_user_id INTEGER REFERENCES users(id),
        details TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("[migrate] Migrations complete.");
  } catch (err) {
    console.error("[migrate] Migration error:", err);
    throw err;
  } finally {
    client.release();
  }
}
