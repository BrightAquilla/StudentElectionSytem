import "dotenv/config";
import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { runMigrations } from "../server/migrate";
import { users } from "@shared/schema";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function ensureLoadUser(input: {
  username: string;
  email: string;
  name: string;
  password: string;
}) {
  const existing = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
  const hashedPassword = await hashPassword(input.password);

  if (existing.length > 0) {
    await db
      .update(users)
      .set({
        email: input.email,
        name: input.name,
        password: hashedPassword,
        role: "voter",
        isAdmin: false,
        isDisabled: false,
        deletedAt: null,
      })
      .where(eq(users.id, existing[0].id));
    return false;
  }

  await db.insert(users).values({
    username: input.username,
    email: input.email,
    name: input.name,
    password: hashedPassword,
    role: "voter",
    isAdmin: false,
    isDisabled: false,
    deletedAt: null,
  });
  return true;
}

async function main() {
  await runMigrations();

  const count = Math.max(1, Number(process.env.LOAD_USER_COUNT || 500));
  const password = process.env.LOAD_USER_PASSWORD || "loadtest123";
  let created = 0;
  let updated = 0;

  for (let i = 1; i <= count; i += 1) {
    const code = String(10 + (i % 90)).padStart(2, "0");
    const serial = String(50000 + i).padStart(5, "0");
    const year = String(24 + (i % 3)).slice(-2);
    const username = `LT${code}/PU/${serial}/${year}`;
    const wasCreated = await ensureLoadUser({
      username,
      email: `loaduser${i}@pwani.local`,
      name: `Load User ${i}`,
      password,
    });

    if (wasCreated) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  console.log("Load user seed complete.");
  console.log(`Requested users: ${count}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Password for all load users: ${password}`);
  console.log("Username pattern example: LT11/PU/50001/25");
}

main()
  .catch((error) => {
    console.error("Load user seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
