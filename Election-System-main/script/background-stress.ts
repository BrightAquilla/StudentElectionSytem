type StressUser = {
  username: string;
  password: string;
  cookie?: string;
  votedElectionIds?: Set<number>;
};

type VoteTarget = {
  electionId: number;
  electionTitle: string;
  candidateId: number;
  candidateName: string;
};

type StressPersona = "voter" | "admin" | "analyst";
type StageName = "warmup" | "steady" | "spike" | "cooldown";

type Stage = {
  name: StageName;
  startRatio: number;
  endRatio: number;
  loadMultiplier: number;
  burstChance: number;
  burstMultiplier: number;
};

type WorkerProfile = {
  id: number;
  persona: StressPersona;
  primaryAction: ActionName;
};

type ActionName =
  | "voting"
  | "registration"
  | "authentication"
  | "account"
  | "user_management"
  | "candidate_workflow"
  | "election_management"
  | "system_processing"
  | "analytics_background";

const MONITORED_ACTIONS: ActionName[] = [
  "voting",
  "registration",
  "authentication",
  "account",
  "user_management",
  "candidate_workflow",
  "election_management",
  "system_processing",
  "analytics_background",
];

type ActionStat = {
  total: number;
  ok: number;
  failed: number;
  totalMs: number;
  maxMs: number;
};

type StressConfig = {
  baseUrl: string;
  durationMs: number;
  virtualUsers: number;
  reportEveryMs: number;
  targetRps: number;
  jitterRatio: number;
  enableVotes: boolean;
  enableRegistrations: boolean;
  voteElectionId: number;
  voteCandidateId: number;
  personaSplit: {
    voter: number;
    admin: number;
    analyst: number;
  };
  admin: StressUser;
  analyst: StressUser;
  voterPool: StressUser[];
};

const STAGES: Stage[] = [
  { name: "warmup", startRatio: 0, endRatio: 0.2, loadMultiplier: 0.45, burstChance: 0.06, burstMultiplier: 2 },
  { name: "steady", startRatio: 0.2, endRatio: 0.75, loadMultiplier: 1, burstChance: 0.12, burstMultiplier: 3 },
  { name: "spike", startRatio: 0.75, endRatio: 0.92, loadMultiplier: 1.65, burstChance: 0.35, burstMultiplier: 7 },
  { name: "cooldown", startRatio: 0.92, endRatio: 1, loadMultiplier: 0.35, burstChance: 0.04, burstMultiplier: 1 },
];

const config = loadConfig();
const stats = new Map<ActionName, ActionStat>();
const startedAt = Date.now();
let stopRequested = false;
let registerSequence = Date.now() % 50_000;
let nextRegistrationAt = 0;
let voteTargets: VoteTarget[] = [];
let lastVoteTargetRefreshAt = 0;

async function main() {
  const baseUrl = await resolveReachableBaseUrl(config.baseUrl);
  config.baseUrl = baseUrl;
  console.log(`Using base URL: ${baseUrl}`);
  console.log(`Virtual users: ${config.virtualUsers}`);
  console.log(`Duration: ${(config.durationMs / 1000).toFixed(0)}s`);
  console.log(`Target throughput: ${config.targetRps.toFixed(0)} req/s (steady stage)`);
  console.log(`Registrations: ${config.enableRegistrations ? "enabled" : "disabled"}`);
  console.log(`Votes: ${config.enableVotes ? "enabled" : "disabled"}`);
  console.log(
    `Personas: voter ${Math.round(config.personaSplit.voter * 100)}% | admin ${Math.round(config.personaSplit.admin * 100)}% | analyst ${Math.round(config.personaSplit.analyst * 100)}%`,
  );

  config.admin.cookie = await loginAndGetCookie(baseUrl, config.admin);
  config.analyst.cookie = await loginAndGetCookie(baseUrl, config.analyst);
  await warmVoterSessions(baseUrl, config.voterPool);
  voteTargets = await refreshVoteTargets();
  if (voteTargets.length > 0) {
    console.log(`Vote targets discovered: ${voteTargets.length}`);
  } else if (config.enableVotes) {
    console.log("No active approved vote targets found. Falling back to configured election/candidate.");
  }

  const stopAt = Date.now() + config.durationMs;
  const workerProfiles = createWorkerProfiles(config.virtualUsers);
  console.log(`Action pools: ${formatWorkerActionSummary(workerProfiles)}`);
  const reporter = setInterval(() => printSummary(false), config.reportEveryMs);
  const workers = workerProfiles.map((worker) => runWorker(worker, stopAt));

  process.on("SIGINT", () => {
    stopRequested = true;
  });
  process.on("SIGTERM", () => {
    stopRequested = true;
  });

  await Promise.all(workers);
  clearInterval(reporter);
  printSummary(true);
}

function loadConfig(): StressConfig {
  const baseUrl = process.env.LOAD_TEST_BASE_URL || "http://localhost:5000";
  const durationMs = Math.max(10_000, Number(process.env.STRESS_DURATION_MS || 120_000));
  const virtualUsers = Math.max(1, Number(process.env.STRESS_VIRTUAL_USERS || 500));
  const reportEveryMs = Math.max(1_000, Number(process.env.STRESS_REPORT_EVERY_MS || 5_000));
  const targetRps = Math.max(1, Number(process.env.STRESS_TARGET_RPS || 250));
  const jitterRatio = Math.min(0.9, Math.max(0, Number(process.env.STRESS_JITTER_RATIO || 0.25)));
  const enableVotes = process.env.STRESS_ENABLE_VOTES !== "false";
  const enableRegistrations = process.env.STRESS_ENABLE_REGISTRATIONS !== "false";
  const voteElectionId = Number(process.env.VOTE_TEST_ELECTION_ID || 1);
  const voteCandidateId = Number(process.env.VOTE_TEST_CANDIDATE_ID || 1);
  const admin = {
    username: process.env.LOAD_TEST_USERNAME || "admin",
    password: process.env.LOAD_TEST_PASSWORD || "admin123",
  };
  const analyst = {
    username: process.env.STRESS_ANALYST_USERNAME || "AN00/PU/40000/24",
    password: process.env.STRESS_ANALYST_PASSWORD || "analyst123",
  };
  const personaSplit = normalizePersonaSplit(
    Number(process.env.STRESS_VOTER_RATIO || 0.88),
    Number(process.env.STRESS_ADMIN_RATIO || 0.08),
    Number(process.env.STRESS_ANALYST_RATIO || 0.04),
  );
  const voterPool = process.env.STRESS_VOTER_USERS
    ? process.env.STRESS_VOTER_USERS
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [username, password] = entry.split(":");
          if (!username || !password) {
            throw new Error(`Invalid STRESS_VOTER_USERS entry: ${entry}`);
          }
          return { username, password };
        })
    : buildDefaultStressUsers(
        Math.max(1, Number(process.env.STRESS_POOL_SIZE || 250)),
        process.env.STRESS_VOTER_PASSWORD || "loadtest123",
      );

  return {
    baseUrl,
    durationMs,
    virtualUsers,
    reportEveryMs,
    targetRps,
    jitterRatio,
    enableVotes,
    enableRegistrations,
    voteElectionId,
    voteCandidateId,
    personaSplit,
    admin,
    analyst,
    voterPool,
  };
}

function normalizePersonaSplit(voter: number, admin: number, analyst: number) {
  const safe = [voter, admin, analyst].map((value) => (Number.isFinite(value) && value > 0 ? value : 0));
  const total = safe.reduce((sum, value) => sum + value, 0) || 1;
  return {
    voter: safe[0] / total,
    admin: safe[1] / total,
    analyst: safe[2] / total,
  };
}

function createWorkerProfiles(count: number) {
  const activeActions = getActiveActions();
  const profiles: WorkerProfile[] = [];
  const voterCount = Math.round(count * config.personaSplit.voter);
  const adminCount = Math.max(1, Math.round(count * config.personaSplit.admin));

  let id = 1;
  for (let i = 0; i < voterCount; i += 1) {
    profiles.push({
      id,
      persona: "voter",
      primaryAction: activeActions[(id - 1) % activeActions.length],
    });
    id += 1;
  }
  for (let i = 0; i < adminCount; i += 1) {
    profiles.push({
      id,
      persona: "admin",
      primaryAction: activeActions[(id - 1) % activeActions.length],
    });
    id += 1;
  }
  while (profiles.length < count) {
    profiles.push({
      id,
      persona: "analyst",
      primaryAction: activeActions[(id - 1) % activeActions.length],
    });
    id += 1;
  }

  return profiles;
}

async function warmVoterSessions(baseUrl: string, pool: StressUser[]) {
  for (const user of pool) {
    try {
      user.cookie = await loginAndGetCookie(baseUrl, user);
    } catch (error) {
      console.warn(`Skipping voter ${user.username}: ${formatError(error)}`);
    }
  }
}

async function runWorker(worker: WorkerProfile, stopAt: number) {
  while (!stopRequested && Date.now() < stopAt) {
    const stage = getCurrentStage(stopAt);
    const burstCount = Math.random() < stage.burstChance ? stage.burstMultiplier : 1;

    for (let i = 0; i < burstCount; i += 1) {
      if (stopRequested || Date.now() >= stopAt) break;
      const action = worker.primaryAction;
      const started = performance.now();
      try {
        const ok = await executeAction(action, worker.persona);
        recordStat(action, ok, performance.now() - started);
      } catch (error) {
        recordStat(action, false, performance.now() - started);
        console.warn(`${worker.persona}:${action} failed: ${formatError(error)}`);
      }
    }

    if (stopRequested || Date.now() >= stopAt) break;
    await sleep(calculatePauseMs(stage, burstCount));
  }
}

function getCurrentStage(stopAt: number) {
  const total = Math.max(1, stopAt - startedAt);
  const elapsedRatio = Math.min(1, Math.max(0, (Date.now() - startedAt) / total));
  return STAGES.find((stage) => elapsedRatio >= stage.startRatio && elapsedRatio < stage.endRatio) ?? STAGES[STAGES.length - 1];
}

function getActiveActions() {
  return MONITORED_ACTIONS.filter((action) => {
    if (action === "voting") return config.enableVotes;
    if (action === "registration") return config.enableRegistrations;
    return true;
  });
}

function formatWorkerActionSummary(workers: WorkerProfile[]) {
  const counts = new Map<ActionName, number>();
  for (const worker of workers) {
    counts.set(worker.primaryAction, (counts.get(worker.primaryAction) ?? 0) + 1);
  }
  return getActiveActions()
    .map((action) => `${action}=${counts.get(action) ?? 0}`)
    .join(" | ");
}

function calculatePauseMs(stage: Stage, burstCount: number) {
  const effectiveRps = Math.max(1, config.targetRps * stage.loadMultiplier);
  const perWorkerRps = Math.max(0.5, effectiveRps / Math.max(1, config.virtualUsers));
  const basePauseMs = 1000 / perWorkerRps;
  const burstAdjustedPauseMs = basePauseMs / Math.max(1, burstCount);
  const jitterSpan = burstAdjustedPauseMs * config.jitterRatio;
  const jitter = jitterSpan > 0 ? (Math.random() * jitterSpan * 2) - jitterSpan : 0;
  return Math.max(0, Math.round(burstAdjustedPauseMs + jitter));
}

function getPersonaWeights(persona: StressPersona) {
  if (persona === "admin") {
    return [
      { action: "user_management" as ActionName, weight: 24 },
      { action: "election_management" as ActionName, weight: 20 },
      { action: "candidate_workflow" as ActionName, weight: 18 },
      { action: "system_processing" as ActionName, weight: 14 },
      { action: "authentication" as ActionName, weight: 10 },
      { action: "registration" as ActionName, weight: config.enableRegistrations ? 10 : 0 },
      { action: "account" as ActionName, weight: 4 },
      { action: "analytics_background" as ActionName, weight: 2 },
      { action: "voting" as ActionName, weight: 0 },
    ];
  }
  if (persona === "analyst") {
    return [
      { action: "account" as ActionName, weight: 26 },
      { action: "authentication" as ActionName, weight: 22 },
      { action: "election_management" as ActionName, weight: 16 },
      { action: "system_processing" as ActionName, weight: 12 },
      { action: "analytics_background" as ActionName, weight: 18 },
      { action: "candidate_workflow" as ActionName, weight: 6 },
      { action: "registration" as ActionName, weight: 0 },
      { action: "user_management" as ActionName, weight: 0 },
      { action: "voting" as ActionName, weight: 0 },
    ];
  }
  return [
    { action: "election_management" as ActionName, weight: 24 },
    { action: "voting" as ActionName, weight: config.enableVotes ? 22 : 0 },
    { action: "account" as ActionName, weight: 16 },
    { action: "authentication" as ActionName, weight: 12 },
    { action: "candidate_workflow" as ActionName, weight: 10 },
    { action: "registration" as ActionName, weight: config.enableRegistrations ? 8 : 0 },
    { action: "analytics_background" as ActionName, weight: 4 },
    { action: "system_processing" as ActionName, weight: 2 },
    { action: "user_management" as ActionName, weight: 2 },
  ];
}

async function executeAction(action: ActionName, persona: StressPersona) {
  switch (action) {
    case "voting":
      return votingAction();
    case "registration":
      return registrationAction();
    case "authentication":
      return authenticationAction(persona);
    case "account":
      return accountAction(persona);
    case "user_management":
      return userManagementAction(persona);
    case "candidate_workflow":
      return candidateWorkflowAction(persona);
    case "election_management":
      return electionManagementAction(persona);
    case "system_processing":
      return systemProcessingAction(persona);
    case "analytics_background":
      return analyticsBackgroundAction(persona);
    default:
      return false;
  }
}

function resolvePersonaUser(persona: StressPersona) {
  if (persona === "admin") return config.admin;
  if (persona === "analyst") return config.analyst;
  return pickAvailableVoter();
}

async function authenticationAction(persona: StressPersona) {
  const user = persona === "admin"
    ? config.admin
    : persona === "analyst"
      ? config.analyst
      : pick([config.admin, config.analyst, ...config.voterPool.filter((entry) => !!entry.password)]);
  const cookie = await loginAndGetCookie(config.baseUrl, user);
  user.cookie = cookie;
  return true;
}

async function accountAction(persona: StressPersona) {
  const user = resolvePersonaUser(persona);
  if (!user?.cookie) return false;
  const response = await authedFetch("/api/user", user.cookie);
  return response.ok;
}

async function userManagementAction(persona: StressPersona) {
  const cookie = persona === "admin" ? config.admin.cookie : config.admin.cookie;
  if (!cookie) return false;
  const endpoints = [
    "/api/voters?page=1&pageSize=20",
    "/api/voters?page=1&pageSize=20&role=candidate",
    "/api/voters?page=1&pageSize=20&role=voter",
  ];
  const response = await authedFetch(pick(endpoints), cookie);
  return response.ok;
}

async function candidateWorkflowAction(persona: StressPersona) {
  if (persona === "admin") {
    if (!config.admin.cookie) return false;
    const endpoints = [
      "/api/candidates?status=pending&page=1&pageSize=12",
      "/api/candidates?status=approved&page=1&pageSize=12",
      "/api/candidates?status=rejected&page=1&pageSize=12",
    ];
    const response = await authedFetch(pick(endpoints), config.admin.cookie);
    return response.ok;
  }

  const user = resolvePersonaUser(persona);
  if (!user?.cookie) return false;
  const response = await authedFetch("/api/candidates/my", user.cookie);
  return response.ok;
}

async function electionManagementAction(persona: StressPersona) {
  const user = resolvePersonaUser(persona) ?? config.admin;
  if (!user?.cookie) return false;

  const listResponse = await authedFetch("/api/elections", user.cookie);
  if (!listResponse.ok) {
    return false;
  }

  const elections = await listResponse.json().catch(() => []) as Array<{ id: number }>;
  if (elections.length === 0) {
    return true;
  }

  const target = pick(elections);
  const detailResponse = await authedFetch(`/api/elections/${target.id}`, user.cookie);
  return detailResponse.ok;
}

async function systemProcessingAction(persona: StressPersona) {
  const adminCookie = config.admin.cookie;
  if (!adminCookie) return false;

  const endpoints = [
    "/api/performance/metrics",
    "/api/audit-logs?page=1&pageSize=10",
  ];

  const path = persona === "admin" || Math.random() > 0.25 ? pick(endpoints) : "/api/performance/metrics";
  const response = await authedFetch(path, adminCookie);
  return response.ok;
}

async function analyticsBackgroundAction(persona: StressPersona) {
  const user = resolvePersonaUser(persona);
  if (!user?.cookie) return false;
  const response = await authedFetch("/api/analytics/proceedings", user.cookie);
  return response.ok;
}

async function votingAction() {
  const eligibleVoters = shuffle(config.voterPool.filter((entry) => !!entry.cookie)).slice(0, 16);
  for (const voter of eligibleVoters) {
    const target = await pickVoteTargetForUser(voter);
    if (!target) {
      continue;
    }

    const response = await fetch(`${config.baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: voter.cookie!,
      },
      body: JSON.stringify({
        electionId: target.electionId,
        candidateId: target.candidateId,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      const message = await readResponseMessage(response);
      if (message.toLowerCase().includes("already voted")) {
        markElectionAsVoted(voter, target.electionId);
        continue;
      }
      return false;
    }

    markElectionAsVoted(voter, target.electionId);
    return true;
  }
  return false;
}

async function registrationAction() {
  const slot = claimRegistrationSlot();
  if (slot === null) {
    return true;
  }

  const password = "loadtest123";
  const username = generateRegistrationNumber(slot);
  const email = `loadtest+${slot}-${Date.now()}@pwani.local`;
  const accountType = Math.random() < 0.1 ? "candidate" : "voter";
  const response = await fetch(`${config.baseUrl}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Load Test ${slot}`,
      username,
      email,
      password,
      accountType,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    return false;
  }

  const user: StressUser = { username, password };
  try {
    user.cookie = await loginAndGetCookie(config.baseUrl, user);
    config.voterPool.push(user);
  } catch {
    // Registration is enough to exercise the path. Login warm-up is secondary.
  }

  return true;
}

function claimRegistrationSlot() {
  const now = Date.now();
  if (now < nextRegistrationAt) {
    return null;
  }
  nextRegistrationAt = now + 1_000;
  registerSequence += 1;
  return registerSequence;
}

async function authedFetch(path: string, cookie: string) {
  return fetch(`${config.baseUrl}${path}`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(8_000),
  });
}

async function loginAndGetCookie(baseUrl: string, user: StressUser) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: user.username,
      password: user.password,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!response.ok) {
    throw new Error(`login failed (${response.status})`);
  }

  const rawCookie = response.headers.get("set-cookie");
  if (!rawCookie) {
    throw new Error("no session cookie returned");
  }

  return rawCookie.split(",").map((part) => part.split(";")[0]).join("; ");
}

async function resolveReachableBaseUrl(inputBaseUrl: string) {
  const candidates = new Set<string>([inputBaseUrl.replace(/\/$/, "")]);
  if (inputBaseUrl.includes("localhost")) {
    candidates.add(inputBaseUrl.replace("localhost", "127.0.0.1").replace(/\/$/, ""));
  }

  const errors: string[] = [];
  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/api/user`, {
        method: "GET",
        signal: AbortSignal.timeout(3_000),
      });
      if (response.status === 200 || response.status === 401 || response.status === 403) {
        return candidate;
      }
      errors.push(`${candidate} responded with ${response.status}`);
    } catch (error) {
      errors.push(`${candidate} unreachable (${formatError(error)})`);
    }
  }

  throw new Error(
    `Could not reach the app server. Start \`npm run dev\` first, then retry. Checked: ${errors.join("; ")}`,
  );
}

function pickAvailableVoter() {
  const eligible = config.voterPool.filter((entry) => !!entry.cookie);
  if (eligible.length === 0) {
    return null;
  }
  return pick(eligible);
}

async function pickVoteTargetForUser(voter: StressUser) {
  const targets = await getVoteTargets();
  if (targets.length === 0) {
    return {
      electionId: config.voteElectionId,
      electionTitle: `Configured Election ${config.voteElectionId}`,
      candidateId: config.voteCandidateId,
      candidateName: `Configured Candidate ${config.voteCandidateId}`,
    };
  }

  const available = targets.filter((entry) => !getVotedElectionIds(voter).has(entry.electionId));
  if (available.length === 0) {
    return null;
  }

  return pick(available);
}

async function getVoteTargets() {
  const now = Date.now();
  if (now - lastVoteTargetRefreshAt > 30_000) {
    voteTargets = await refreshVoteTargets();
  }
  return voteTargets;
}

async function refreshVoteTargets() {
  lastVoteTargetRefreshAt = Date.now();
  if (!config.admin.cookie) {
    return [];
  }

  try {
    const electionsResponse = await authedFetch("/api/elections", config.admin.cookie);
    if (!electionsResponse.ok) {
      return [];
    }

    const elections = await electionsResponse.json().catch(() => []) as Array<{
      id: number;
      title: string;
      isPublished: boolean;
      startDate: string;
      endDate: string;
    }>;

    const now = Date.now();
    const activeElections = elections.filter((election) => {
      const start = new Date(election.startDate).getTime();
      const end = new Date(election.endDate).getTime();
      return election.isPublished && now >= start && now <= end;
    });

    const targets: VoteTarget[] = [];
    for (const election of activeElections) {
      const detailResponse = await authedFetch(`/api/elections/${election.id}`, config.admin.cookie);
      if (!detailResponse.ok) continue;

      const detail = await detailResponse.json().catch(() => null) as {
        candidates?: Array<{ id: number; name: string; status?: string | null }>;
      } | null;

      const approvedCandidates = (detail?.candidates ?? []).filter(
        (candidate) => (candidate.status ?? "approved") === "approved",
      );

      for (const candidate of approvedCandidates) {
        targets.push({
          electionId: election.id,
          electionTitle: election.title,
          candidateId: candidate.id,
          candidateName: candidate.name,
        });
      }
    }

    return targets;
  } catch {
    return [];
  }
}

function getVotedElectionIds(voter: StressUser) {
  if (!voter.votedElectionIds) {
    voter.votedElectionIds = new Set<number>();
  }
  return voter.votedElectionIds;
}

function markElectionAsVoted(voter: StressUser, electionId: number) {
  getVotedElectionIds(voter).add(electionId);
}

function recordStat(action: ActionName, ok: boolean, durationMs: number) {
  const entry = stats.get(action) ?? {
    total: 0,
    ok: 0,
    failed: 0,
    totalMs: 0,
    maxMs: 0,
  };

  entry.total += 1;
  entry.totalMs += durationMs;
  entry.maxMs = Math.max(entry.maxMs, durationMs);
  if (ok) {
    entry.ok += 1;
  } else {
    entry.failed += 1;
  }

  stats.set(action, entry);
}

function printSummary(final: boolean) {
  const elapsedSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  const totalRequests = Array.from(stats.values()).reduce((sum, entry) => sum + entry.total, 0);
  const totalOk = Array.from(stats.values()).reduce((sum, entry) => sum + entry.ok, 0);
  const totalFailed = totalRequests - totalOk;
  const rps = totalRequests / elapsedSeconds;
  const currentStage = getCurrentStage(Date.now() + 1);

  console.log("");
  console.log(final ? "Final Stress Summary" : "Rolling Stress Summary");
  console.log("=====================");
  console.log(`Elapsed: ${elapsedSeconds}s`);
  console.log(`Stage: ${currentStage.name}`);
  console.log(`Requests: ${totalRequests} total | ${totalOk} ok | ${totalFailed} failed | ${rps.toFixed(1)} req/s`);
  console.log(`Voter sessions available: ${config.voterPool.filter((entry) => !!entry.cookie).length}`);
  console.log(`Vote targets in rotation: ${voteTargets.length || 1}`);

  for (const [action, entry] of Array.from(stats.entries()).sort((a, b) => b[1].total - a[1].total)) {
    const averageMs = entry.total > 0 ? entry.totalMs / entry.total : 0;
    console.log(
      `${action} | total=${entry.total} ok=${entry.ok} failed=${entry.failed} avg=${averageMs.toFixed(1)}ms max=${entry.maxMs.toFixed(1)}ms`,
    );
  }
}

function generateRegistrationNumber(sequence: number) {
  const prefixes = ["SB", "EB", "AB", "FB", "GB", "HB", "JB", "KB"];
  const prefix = prefixes[sequence % prefixes.length];
  const code = String(30 + (sequence % 60)).padStart(2, "0");
  const serial = String(40200 + (sequence % 50000)).padStart(5, "0");
  const year = String(24 + (sequence % 3)).slice(-2);
  return `${prefix}${code}/PU/${serial}/${year}`;
}

function buildDefaultStressUsers(count: number, password: string): StressUser[] {
  const users: StressUser[] = [];
  for (let i = 1; i <= count; i += 1) {
    const code = String(10 + (i % 90)).padStart(2, "0");
    const serial = String(50000 + i).padStart(5, "0");
    const year = String(24 + (i % 3)).slice(-2);
    users.push({
      username: `LT${code}/PU/${serial}/${year}`,
      password,
    });
  }
  return users;
}

function pick<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const swapIndex = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[swapIndex]] = [copy[swapIndex], copy[i]];
  }
  return copy;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readResponseMessage(response: Response) {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  return body?.message || `status ${response.status}`;
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

main().catch((error) => {
  console.error("Background stress test failed:", formatError(error));
  process.exitCode = 1;
});
