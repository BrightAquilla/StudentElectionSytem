type VoteUser = {
  username: string;
  password: string;
};

type VoteConfig = {
  baseUrl: string;
  electionId: number;
  candidateId: number;
  users: VoteUser[];
};

async function main() {
  const config = loadConfig();
  const baseUrl = await resolveReachableBaseUrl(config.baseUrl);
  console.log(`Using base URL: ${baseUrl}`);
  console.log(`Target election: ${config.electionId}, candidate: ${config.candidateId}`);
  console.log(`Voting users: ${config.users.length}`);

  const results = await Promise.all(
    config.users.map((user) => castVoteForUser(baseUrl, user, config.electionId, config.candidateId)),
  );

  const success = results.filter((entry) => entry.ok).length;
  const failed = results.length - success;
  console.log("");
  console.log("Vote Load Test Summary");
  console.log("======================");
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
  for (const result of results) {
    console.log(`${result.username} | ${result.ok ? "OK" : "FAILED"} | ${result.message}`);
  }
}

function loadConfig(): VoteConfig {
  const baseUrl = process.env.LOAD_TEST_BASE_URL || "http://localhost:5000";
  const electionId = Number(process.env.VOTE_TEST_ELECTION_ID || 1);
  const candidateId = Number(process.env.VOTE_TEST_CANDIDATE_ID || 1);
  const rawUsers = process.env.VOTE_TEST_USERS || "SB32/PU/40202/24:voter123";
  const users = rawUsers
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [username, password] = entry.split(":");
      if (!username || !password) {
        throw new Error(`Invalid VOTE_TEST_USERS entry: ${entry}`);
      }
      return { username, password };
    });

  if (!Number.isFinite(electionId) || !Number.isFinite(candidateId)) {
    throw new Error("VOTE_TEST_ELECTION_ID and VOTE_TEST_CANDIDATE_ID must be valid numbers.");
  }

  return { baseUrl, electionId, candidateId, users };
}

async function castVoteForUser(baseUrl: string, user: VoteUser, electionId: number, candidateId: number) {
  try {
    const cookie = await loginAndGetCookie(baseUrl, user);
    const response = await fetch(`${baseUrl}/api/votes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify({ electionId, candidateId }),
      signal: AbortSignal.timeout(8_000),
    });

    if (response.ok) {
      return { username: user.username, ok: true, message: "vote recorded" };
    }

    const body = await response.json().catch(() => null);
    return {
      username: user.username,
      ok: false,
      message: body?.message || `status ${response.status}`,
    };
  } catch (error) {
    return {
      username: user.username,
      ok: false,
      message: formatError(error),
    };
  }
}

async function loginAndGetCookie(baseUrl: string, user: VoteUser) {
  const response = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`login failed (${response.status})`);
  }

  const rawCookie = response.headers.get("set-cookie");
  if (!rawCookie) {
    throw new Error("login returned no session cookie");
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

  throw new Error(`Could not reach the app server. Start \`npm run dev\` first. Checked: ${errors.join("; ")}`);
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

main().catch((error) => {
  console.error("Vote load test failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
