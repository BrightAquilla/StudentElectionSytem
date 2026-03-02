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
  candidates: { name: string; party: string; partyManifesto: string; platform: string; symbol?: string }[];
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

async function ensureCandidate(electionId: number, input: { name: string; party: string; partyManifesto: string; platform: string; symbol?: string }) {
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
        partyManifesto: input.partyManifesto,
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
        partyManifesto: input.partyManifesto,
        platform: input.platform,
        symbol: input.symbol ?? null,
        status: "approved",
    })
    .returning();
  return created;
}

async function ensureCandidateApplication(input: {
  electionId: number;
  userId: number;
  name: string;
  party: string;
  partyManifesto: string;
  platform: string;
  symbol?: string;
  status: "pending" | "approved" | "rejected";
  reviewNotes?: string | null;
}) {
  const existing = await db
    .select()
    .from(candidates)
    .where(and(eq(candidates.electionId, input.electionId), eq(candidates.name, input.name)))
    .limit(1);

  const values = {
    electionId: input.electionId,
    userId: input.userId,
    name: input.name,
    party: input.party,
    partyManifesto: input.partyManifesto,
    platform: input.platform,
    symbol: input.symbol ?? null,
    status: input.status,
    reviewNotes: input.reviewNotes ?? null,
    reviewedAt: input.status === "pending" ? null : new Date(),
  };

  if (existing.length > 0) {
    const [updated] = await db
      .update(candidates)
      .set(values)
      .where(eq(candidates.id, existing[0].id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(candidates).values(values).returning();
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

  const demoCandidateUser = await ensureUser({
    username: "CD11/PU/51001/25",
    email: "candidate.demo@pwani.local",
    name: "Candidate Demo",
    role: "voter",
    isAdmin: false,
    password: "candidate123",
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
        { name: "Brian Mwatela", party: "Unity Front", partyManifesto: "Unity Front focuses on student welfare, strong representation, and accountable campus leadership.", platform: "Academic reform and student welfare.", symbol: "Eagle" },
        { name: "Janet Njeri", party: "Forward Alliance", partyManifesto: "Forward Alliance champions innovation, digital access, and scholarship support for all learners.", platform: "Digital campus and scholarship support.", symbol: "Torch" },
        { name: "David Omondi", party: "Independent", partyManifesto: "Independent candidates campaign on flexible, issue-based leadership without party constraints.", platform: "Transparent budgeting and club funding.", symbol: "Bridge" },
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
        { name: "Mercy Akinyi", party: "Unity Front", partyManifesto: "Unity Front focuses on student welfare, strong representation, and accountable campus leadership.", platform: "Improve hostels and student services.", symbol: "Shield" },
        { name: "Peter Kiprono", party: "Forward Alliance", partyManifesto: "Forward Alliance champions innovation, digital access, and scholarship support for all learners.", platform: "Expand mentorship and peer tutoring.", symbol: "Compass" },
        { name: "Lydia Mwende", party: "Independent", partyManifesto: "Independent candidates campaign on flexible, issue-based leadership without party constraints.", platform: "Inclusive leadership and sports support.", symbol: "Wave" },
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
        { name: "Kevin Kilonzo", party: "Campus Governance", partyManifesto: "Campus Governance prioritizes disciplined administration, transparency, and responsive student offices.", platform: "Efficient communication and student records.", symbol: "Atom" },
        { name: "Esther Atieno", party: "Independent", partyManifesto: "Independent candidates campaign on flexible, issue-based leadership without party constraints.", platform: "Transparent secretariat operations.", symbol: "Leaf" },
        { name: "Samuel Wekesa", party: "Scholars Bloc", partyManifesto: "Scholars Bloc advocates for academic efficiency, policy follow-through, and evidence-based leadership.", platform: "Faster meeting minutes and policy tracking.", symbol: "Book" },
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
        { name: "Faith Wanjiru", party: "Fiscal Reform", partyManifesto: "Fiscal Reform stands for transparent budgets, disciplined spending, and measurable value for student funds.", platform: "Budget transparency and monthly financial briefs.", symbol: "Notebook" },
        { name: "Ibrahim Hassan", party: "Independent", partyManifesto: "Independent candidates campaign on flexible, issue-based leadership without party constraints.", platform: "Cost controls and accountable expenditure.", symbol: "Circle" },
        { name: "Sharon Nekesa", party: "Future Union", partyManifesto: "Future Union backs resilient student finance, emergency support, and long-term welfare planning.", platform: "Scholarship support and emergency fund policy.", symbol: "Spark" },
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
        { name: "Collins Mutua", party: "Academic Progress", partyManifesto: "Academic Progress advocates for stronger learning support, faculty coordination, and academic success systems.", platform: "Revision support and faculty coordination.", symbol: "Ball" },
        { name: "Naomi Chebet", party: "Independent", partyManifesto: "Independent candidates campaign on flexible, issue-based leadership without party constraints.", platform: "Academic mentorship and exam readiness clinics.", symbol: "Track" },
        { name: "George Muli", party: "Team First", partyManifesto: "Team First focuses on practical student services, reliable timetables, and accessible learning resources.", platform: "Learning resources and timetable stability.", symbol: "Whistle" },
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
        { name: "Carol Njoki", party: "Campus Athletics", partyManifesto: "Campus Athletics promotes healthy competition, sports access, and better support for student athletes.", platform: "More inter-faculty tournaments and sports inclusion.", symbol: "Music" },
        { name: "Victor Mwangi", party: "Independent", partyManifesto: "Independent candidates campaign on flexible, issue-based leadership without party constraints.", platform: "Facilities maintenance and athlete welfare.", symbol: "Mic" },
        { name: "Amina Yusuf", party: "Active Union", partyManifesto: "Active Union supports student wellness, inclusive participation, and vibrant campus activities.", platform: "Community fitness programs and wellness drives.", symbol: "Star" },
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
        { name: "Grace Wairimu", party: "Equality First", partyManifesto: "Equality First promotes inclusion, safety, and equal opportunity across student leadership and services.", platform: "Gender inclusion policy and safe-space support.", symbol: "Lotus" },
        { name: "Dennis Ochieng", party: "Independent", partyManifesto: "Independent candidates campaign on flexible, issue-based leadership without party constraints.", platform: "Awareness programs and anti-discrimination advocacy.", symbol: "Scale" },
        { name: "Fatuma Abdalla", party: "Campus Equity", partyManifesto: "Campus Equity focuses on fair representation, support networks, and a more inclusive student culture.", platform: "Inclusive leadership and student support networks.", symbol: "Ribbon" },
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

  const allElections = await db.select().from(elections);
  const presidentElection = allElections.find((entry) => entry.position === "President");
  const financeElection = allElections.find((entry) => entry.position === "Finance Secretary");
  const sportsElection = allElections.find((entry) => entry.position === "Sports Secretary");
  const genderElection = allElections.find((entry) => entry.position === "Gender Secretary");

  if (presidentElection && voterUsers[0]) {
    await ensureCandidateApplication({
      electionId: presidentElection.id,
      userId: voterUsers[0].id,
      name: "Edwin Barasa",
      party: "Campus Renewal League",
      partyManifesto: "Campus Renewal League runs on practical reform: cleaner governance, digital service delivery, and welfare programs funded through disciplined student budgeting.",
      platform: "I will publish executive scorecards monthly, open budget hearings to class reps, and expand emergency support for students under financial pressure.",
      symbol: "Phoenix",
      status: "pending",
      reviewNotes: null,
    });
  }

  if (presidentElection) {
    await ensureCandidateApplication({
      electionId: presidentElection.id,
      userId: demoCandidateUser.id,
      name: "Candidate Demo",
      party: "Leadership Reform Movement",
      partyManifesto: "Leadership Reform Movement focuses on accountable student leadership, transparent welfare funding, and fast response to student concerns through measurable service standards.",
      platform: "I will publish executive action reports every month, hold open student briefings, and push faster resolution channels for academic and welfare complaints.",
      symbol: "Beacon",
      status: "approved",
      reviewNotes: "Demo candidate account approved for dashboard walkthroughs and candidate experience testing.",
    });
  }

  if (financeElection && voterUsers[1]) {
    await ensureCandidateApplication({
      electionId: financeElection.id,
      userId: voterUsers[1].id,
      name: "Joan Muli",
      party: "Transparent Treasury Movement",
      partyManifesto: "Transparent Treasury Movement advocates zero-surprise budgeting, quarterly student finance reviews, and stronger emergency grant systems.",
      platform: "I will digitize vote-approved spending reports, publish bursary timelines, and track every major expenditure against agreed student priorities.",
      symbol: "Ledger",
      status: "pending",
      reviewNotes: null,
    });
  }

  if (sportsElection && voterUsers[2]) {
    await ensureCandidateApplication({
      electionId: sportsElection.id,
      userId: voterUsers[2].id,
      name: "Brenda Kendi",
      party: "Active Campus Forum",
      partyManifesto: "Active Campus Forum pushes for inclusive sports access, modern equipment planning, and stronger athlete support beyond tournament days.",
      platform: "I will prioritize inter-faculty league scheduling, women’s sports visibility, and practical maintenance standards for sports grounds.",
      symbol: "Sprint",
      status: "approved",
      reviewNotes: "Approved for early campaign visibility. Candidate documents were complete.",
    });
  }

  if (genderElection && voterUsers[3]) {
    await ensureCandidateApplication({
      electionId: genderElection.id,
      userId: voterUsers[3].id,
      name: "Ruth Nyawira",
      party: "Inclusion First Coalition",
      partyManifesto: "Inclusion First Coalition focuses on safe reporting channels, equitable participation in leadership, and visible support systems for underrepresented students.",
      platform: "I will build a stronger reporting pathway for discrimination cases and work with societies to improve campus-wide inclusion standards.",
      symbol: "Balance",
      status: "rejected",
      reviewNotes: "Application rejected because required supporter signatures were not attached.",
    });
  }

  console.log("Seed complete.");
  console.log("Admin login: admin / admin123");
  console.log("Analyst login: AN00/PU/40000/24 / analyst123");
  console.log("Voter login example: SB32/PU/40202/24 / voter123");
  console.log("Candidate login: CD11/PU/51001/25 / candidate123");
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
