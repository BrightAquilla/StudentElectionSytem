import { pool } from "./db";
import { PARTY_SEED } from "@shared/schema";

export async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log("[migrate] Running migrations...");

    // Add symbol column to candidates if it doesn't exist
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS symbol TEXT;
    `);
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_id INTEGER NULL REFERENCES users(id);
    `);
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS party_manifesto TEXT;
    `);
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS review_notes TEXT;
    `);
    await client.query(`
      ALTER TABLE candidates ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP NULL;
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS candidates_user_id_idx ON candidates(user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS candidates_status_applied_idx ON candidates(status, applied_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS candidates_election_status_idx ON candidates(election_id, status);
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
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS candidate_party TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS candidate_symbol TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS candidate_party_manifesto TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS candidate_manifesto TEXT;
    `);
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS candidate_approval_status TEXT NOT NULL DEFAULT 'not_applicable';
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
      ALTER TABLE elections ADD COLUMN IF NOT EXISTS eligible_faculties TEXT;
    `);
    await client.query(`
      ALTER TABLE elections ADD COLUMN IF NOT EXISTS eligible_year_levels TEXT;
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
    await client.query(`
      CREATE INDEX IF NOT EXISTS users_role_deleted_created_idx ON users(role, deleted_at, created_at DESC);
    `);
    await client.query(`
      UPDATE users
      SET candidate_approval_status = CASE
        WHEN role = 'candidate' AND is_disabled = TRUE THEN 'pending'
        WHEN role = 'candidate' THEN 'approved'
        ELSE 'not_applicable'
      END
      WHERE candidate_approval_status IS NULL
         OR TRIM(candidate_approval_status) = '';
    `);

    // Audit log table for privileged actions
    await client.query(`
      CREATE TABLE IF NOT EXISTS parties (
        id SERIAL PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        manifesto TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    for (const party of PARTY_SEED) {
      await client.query(
        `
          INSERT INTO parties (code, name, symbol, manifesto)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (code) DO UPDATE
          SET name = EXCLUDED.name,
              symbol = EXCLUDED.symbol,
              manifesto = EXCLUDED.manifesto
        `,
        [party.code, party.name, party.symbol, party.manifesto],
      );
    }

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
    await client.query(`
      CREATE INDEX IF NOT EXISTS votes_election_candidate_idx ON votes(election_id, candidate_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS votes_voter_election_idx ON votes(voter_id, election_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS audit_logs_action_created_at_idx ON audit_logs(action, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS audit_logs_actor_created_at_idx ON audit_logs(actor_id, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS audit_logs_target_created_at_idx ON audit_logs(target_user_id, created_at DESC);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS audit_logs_details_fts_idx
      ON audit_logs
      USING GIN (to_tsvector('simple', COALESCE(details, '')));
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_buckets (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL,
        reset_at TIMESTAMP NOT NULL
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS rate_limit_buckets_reset_at_idx ON rate_limit_buckets(reset_at);
    `);

    console.log("[migrate] Migrations complete.");
  } catch (err) {
    console.error("[migrate] Migration error:", err);
    throw err;
  } finally {
    client.release();
  }
}
