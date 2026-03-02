type TestConfig = {
  baseUrl: string;
  username: string;
  password: string;
  concurrency: number;
  requestsPerWorker: number;
};

type EndpointResult = {
  endpoint: string;
  total: number;
  ok: number;
  failed: number;
  averageMs: number;
  p95Ms: number;
};

const config: TestConfig = {
  baseUrl: process.env.LOAD_TEST_BASE_URL || "http://localhost:5000",
  username: process.env.LOAD_TEST_USERNAME || "admin",
  password: process.env.LOAD_TEST_PASSWORD || "admin123",
  concurrency: Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 25)),
  requestsPerWorker: Math.max(1, Number(process.env.LOAD_TEST_REQUESTS_PER_WORKER || 20)),
};

const endpoints = [
  "/api/user",
  "/api/elections",
  "/api/analytics/proceedings",
  "/api/voters?page=1&pageSize=20",
  "/api/candidates?status=pending&page=1&pageSize=12",
];

async function main() {
  const reachableBaseUrl = await resolveReachableBaseUrl(config.baseUrl);
  const effectiveConfig = { ...config, baseUrl: reachableBaseUrl };
  console.log(`Using base URL: ${effectiveConfig.baseUrl}`);

  const cookie = await loginAndGetCookie(effectiveConfig);
  const results = await Promise.all(
    endpoints.map((endpoint) => runEndpointLoad(endpoint, cookie, effectiveConfig)),
  );

  console.log("");
  console.log("Load Test Summary");
  console.log("=================");
  for (const result of results) {
    console.log(
      `${result.endpoint} | total=${result.total} ok=${result.ok} failed=${result.failed} avg=${result.averageMs.toFixed(1)}ms p95=${result.p95Ms.toFixed(1)}ms`,
    );
  }
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

async function loginAndGetCookie(current: TestConfig) {
  const response = await fetch(`${current.baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: current.username,
      password: current.password,
    }),
    signal: AbortSignal.timeout(5_000),
  });

  if (!response.ok) {
    throw new Error(`Login failed with status ${response.status}`);
  }

  const rawCookie = response.headers.get("set-cookie");
  if (!rawCookie) {
    throw new Error("Login succeeded but no session cookie was returned.");
  }

  return rawCookie.split(",").map((part) => part.split(";")[0]).join("; ");
}

async function runEndpointLoad(endpoint: string, cookie: string, current: TestConfig): Promise<EndpointResult> {
  const durations: number[] = [];
  let ok = 0;
  let failed = 0;

  const workers = Array.from({ length: current.concurrency }, async () => {
    for (let i = 0; i < current.requestsPerWorker; i += 1) {
      const startedAt = performance.now();
      try {
        const response = await fetch(`${current.baseUrl}${endpoint}`, {
          headers: {
            Cookie: cookie,
          },
          signal: AbortSignal.timeout(8_000),
        });
        const elapsed = performance.now() - startedAt;
        durations.push(elapsed);
        if (response.ok) {
          ok += 1;
        } else {
          failed += 1;
        }
      } catch {
        const elapsed = performance.now() - startedAt;
        durations.push(elapsed);
        failed += 1;
      }
    }
  });

  await Promise.all(workers);
  durations.sort((a, b) => a - b);
  const total = durations.length;
  const averageMs = total > 0 ? durations.reduce((sum, value) => sum + value, 0) / total : 0;
  const p95Index = total > 0 ? Math.min(total - 1, Math.floor(total * 0.95)) : 0;

  return {
    endpoint,
    total,
    ok,
    failed,
    averageMs,
    p95Ms: durations[p95Index] ?? 0,
  };
}

function formatError(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

main().catch((error) => {
  console.error("Load test failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
