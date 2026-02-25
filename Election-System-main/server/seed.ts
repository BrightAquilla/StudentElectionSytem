import "dotenv/config";
import { randomBytes, scrypt } from "crypto";
import { promisify } from "util";
import { and, eq } from "drizzle-orm";
import { db, pool } from "./db";
import { runMigrations } from "./migrate";
import { candidates, elections, users, votes, ELECTION_POSITIONS } from "@shared/schema";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

type SeedElection = {
  title: string;
  position: typeof ELECTION_POSITIONS[number];
  description: string;
  startDate: Date;
  endDate: Date;
  isPublished: boolean;
  candidates: { name: string; party: string; platform: string; symbol?: string }[];
  votePlan: number[];
};

function addDays(base: Date, days: number) {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  return date;
}

async function ensureUser(input: {
  username: string;
  email: string;
  name: string;
  role: "admin" | "analyst" | "voter";
  isAdmin: boolean;
  password: string;
}) {
  const existing = await db.select().from(users).where(eq(users.username, input.username)).limit(1);
  const hashed = await hashPassword(input.password);
  if (existing.length > 0) {
    const [updated] = await db
      .update(users)
      .set({
        email: input.email,
        name: input.name,
        role: input.role,
        isAdmin: input.isAdmin,
        password: hashed,
        isDisabled: false,
        deletedAt: null,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(users)
    .values({
      username: input.username,
      email: input.email,
      name: input.name,
      role: input.role,
      isAdmin: input.isAdmin,
      password: hashed,
      isDisabled: false,
      deletedAt: null,
    })
    .returning();
  return created;
}

async function ensureElection(input: Omit<SeedElection, "candidates" | "votePlan">) {
  const existing = await db.select().from(elections).where(eq(elections.title, input.title)).limit(1);
  if (existing.length > 0) {
    const [updated] = await db
      .update(elections)
      .set({
        position: input.position,
        description: input.description,
        startDate: input.startDate,
        endDate: input.endDate,
        isPublished: input.isPublished,
      })
      .where(eq(elections.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(elections).values(input).returning();
  return created;
}

async function ensureCandidate(electionId: number, input: { name: string; party: string; platform: string; symbol?: string }) {
  const existing = await db
    .select()
    .from(candidates)
    .where(and(eq(candidates.electionId, electionId), eq(candidates.name, input.name)))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(candidates)
      .set({
        party: input.party,
        platform: input.platform,
        symbol: input.symbol ?? null,
        status: "approved",
      })
      .where(eq(candidates.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(candidates)
    .values({
      electionId,
      name: input.name,
      party: input.party,
      platform: input.platform,
      symbol: input.symbol ?? null,
      status: "approved",
    })
    .returning();
  return created;
}

async function seedVotes(electionId: number, electionCandidates: { id: number }[], votersPool: { id: number }[], votePlan: number[]) {
  if (electionCandidates.length === 0 || votersPool.length === 0) return;

  let voterCursor = 0;
  const voteRows: (typeof votes.$inferInsert)[] = [];
  const now = new Date();

  for (let i = 0; i < electionCandidates.length; i++) {
    const candidate = electionCandidates[i];
    const targetVotes = votePlan[i] ?? 0;
    for (let j = 0; j < targetVotes; j++) {
      const voter = votersPool[voterCursor % votersPool.length];
      voterCursor++;
      voteRows.push({
        voterId: voter.id,
        electionId,
        candidateId: candidate.id,
        createdAt: new Date(now.getTime() - (voterCursor % 48) * 60 * 60 * 1000),
      });
    }
  }

  if (voteRows.length > 0) {
    await db
      .insert(votes)
      .values(voteRows)
      .onConflictDoNothing({ target: [votes.voterId, votes.electionId] });
  }
}

async function main() {
  await runMigrations();

  const admin = await ensureUser({
    username: "admin",
    email: "admin@pwani.local",
    name: "System Admin",
    role: "admin",
    isAdmin: true,
    password: "admin123",
  });

  await ensureUser({
    username: "AN00/PU/40000/24",
    email: "analyst@pwani.local",
    name: "Election Analyst",
    role: "analyst",
    isAdmin: false,
    password: "analyst123",
  });

  const voterUsers: { id: number }[] = [];
  for (let i = 1; i <= 80; i++) {
    const prefix = i % 2 === 0 ? "SB" : "EB";
    const serial = String((30 + i) % 100).padStart(2, "0");
    const regNo = `${prefix}${serial}/PU/${String(40200 + i).padStart(5, "0")}/${i % 2 === 0 ? "24" : "23"}`;
    const voter = await ensureUser({
      username: regNo,
      email: `voter${i}@pwani.local`,
      name: `Voter ${i}`,
      role: "voter",
      isAdmin: false,
      password: "voter123",
    });
    voterUsers.push({ id: voter.id });
  }

  const now = new Date();
  const electionSeeds: SeedElection[] = [
    {
      title: "2026 Student President Election",
      position: "President",
      description: "Choose the next student body president.",
      startDate: addDays(now, -2),
      endDate: addDays(now, 2),
      isPublished: true,
      candidates: [
        { name: "Brian Mwatela", party: "Unity Front", platform: "Academic reform and student welfare.", symbol: "Eagle" },
        { name: "Janet Njeri", party: "Forward Alliance", platform: "Digital campus and scholarship support.", symbol: "Torch" },
        { name: "David Omondi", party: "Independent", platform: "Transparent budgeting and club funding.", symbol: "Bridge" },
      ],
      votePlan: [26, 21, 13],
    },
    {
      title: "2026 Vice President Election",
      position: "Vice President",
      description: "Elect the vice president to support executive leadership.",
      startDate: addDays(now, -2),
      endDate: addDays(now, 2),
      isPublished: true,
      candidates: [
        { name: "Mercy Akinyi", party: "Unity Front", platform: "Improve hostels and student services.", symbol: "Shield" },
        { name: "Peter Kiprono", party: "Forward Alliance", platform: "Expand mentorship and peer tutoring.", symbol: "Compass" },
        { name: "Lydia Mwende", party: "Independent", platform: "Inclusive leadership and sports support.", symbol: "Wave" },
      ],
      votePlan: [23, 20, 15],
    },
    {
      title: "2026 Secretary General Election",
      position: "Secretary General",
      description: "Elect the secretary general for administrative coordination.",
      startDate: addDays(now, -8),
      endDate: addDays(now, -1),
      isPublished: true,
      candidates: [
        { name: "Kevin Kilonzo", party: "Campus Governance", platform: "Efficient communication and student records.", symbol: "Atom" },
        { name: "Esther Atieno", party: "Independent", platform: "Transparent secretariat operations.", symbol: "Leaf" },
        { name: "Samuel Wekesa", party: "Scholars Bloc", platform: "Faster meeting minutes and policy tracking.", symbol: "Book" },
      ],
      votePlan: [19, 22, 11],
    },
    {
      title: "2026 Finance Secretary Election",
      position: "Finance Secretary",
      description: "Choose the finance secretary to manage student union finances.",
      startDate: addDays(now, 2),
      endDate: addDays(now, 6),
      isPublished: true,
      candidates: [
        { name: "Faith Wanjiru", party: "Fiscal Reform", platform: "Budget transparency and monthly financial briefs.", symbol: "Notebook" },
        { name: "Ibrahim Hassan", party: "Independent", platform: "Cost controls and accountable expenditure.", symbol: "Circle" },
        { name: "Sharon Nekesa", party: "Future Union", platform: "Scholarship support and emergency fund policy.", symbol: "Spark" },
      ],
      votePlan: [0, 0, 0],
    },
    {
      title: "2026 Academic Secretary Election",
      position: "Academic Secretary",
      description: "Elect the academic secretary for curriculum and academic affairs.",
      startDate: addDays(now, -1),
      endDate: addDays(now, 3),
      isPublished: true,
      candidates: [
        { name: "Collins Mutua", party: "Academic Progress", platform: "Revision support and faculty coordination.", symbol: "Ball" },
        { name: "Naomi Chebet", party: "Independent", platform: "Academic mentorship and exam readiness clinics.", symbol: "Track" },
        { name: "George Muli", party: "Team First", platform: "Learning resources and timetable stability.", symbol: "Whistle" },
      ],
      votePlan: [17, 17, 17],
    },
    {
      title: "2026 Sports Secretary Election",
      position: "Sports Secretary",
      description: "Pick the sports secretary to coordinate athletics and student wellness.",
      startDate: addDays(now, 3),
      endDate: addDays(now, 8),
      isPublished: true,
      candidates: [
        { name: "Carol Njoki", party: "Campus Athletics", platform: "More inter-faculty tournaments and sports inclusion.", symbol: "Music" },
        { name: "Victor Mwangi", party: "Independent", platform: "Facilities maintenance and athlete welfare.", symbol: "Mic" },
        { name: "Amina Yusuf", party: "Active Union", platform: "Community fitness programs and wellness drives.", symbol: "Star" },
      ],
      votePlan: [0, 0, 0],
    },
    {
      title: "2026 Gender Secretary Election",
      position: "Gender Secretary",
      description: "Elect the gender secretary to champion inclusion and equality.",
      startDate: addDays(now, 1),
      endDate: addDays(now, 5),
      isPublished: true,
      candidates: [
        { name: "Grace Wairimu", party: "Equality First", platform: "Gender inclusion policy and safe-space support.", symbol: "Lotus" },
        { name: "Dennis Ochieng", party: "Independent", platform: "Awareness programs and anti-discrimination advocacy.", symbol: "Scale" },
        { name: "Fatuma Abdalla", party: "Campus Equity", platform: "Inclusive leadership and student support networks.", symbol: "Ribbon" },
      ],
      votePlan: [0, 0, 0],
    },
  ];

  for (const electionSeed of electionSeeds) {
    const election = await ensureElection({
      title: electionSeed.title,
      position: electionSeed.position,
      description: electionSeed.description,
      startDate: electionSeed.startDate,
      endDate: electionSeed.endDate,
      isPublished: electionSeed.isPublished,
    });

    const electionCandidateRows: { id: number }[] = [];
    for (const candidate of electionSeed.candidates) {
      const created = await ensureCandidate(election.id, candidate);
      electionCandidateRows.push({ id: created.id });
    }

    await seedVotes(election.id, electionCandidateRows, voterUsers, electionSeed.votePlan);
  }

  console.log("Seed complete.");
  console.log("Admin login: admin / admin123");
  console.log("Analyst login: AN00/PU/40000/24 / analyst123");
  console.log("Voter login example: SB32/PU/40202/24 / voter123");
  console.log(`Seeded by user id: ${admin.id}`);
}

main()
  .catch((err) => {
    console.error("Seeding failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
