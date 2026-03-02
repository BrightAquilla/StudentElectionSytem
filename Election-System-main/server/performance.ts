type MetricEntry = {
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  samples: number[];
  lastStatus: number;
};

type PerformanceSnapshot = {
  capturedAt: string;
  totalRequests: number;
  totalFailures: number;
  weightedAverageMs: number;
  peakP95: number;
};

type ActivityMetric = {
  activity: string;
  count: number;
  errorCount: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
  lastStatus: number;
};

const metrics = new Map<string, MetricEntry>();
const MAX_SAMPLES = 200;
const HISTORY_LIMIT = 120;
const SNAPSHOT_INTERVAL_MS = 2_000;
const history: PerformanceSnapshot[] = [];
let lastSnapshotAt = 0;

export function recordRequestMetric(key: string, durationMs: number, status: number) {
  const existing = metrics.get(key) ?? {
    count: 0,
    errorCount: 0,
    totalMs: 0,
    maxMs: 0,
    samples: [],
    lastStatus: status,
  };

  existing.count += 1;
  if (status >= 400) {
    existing.errorCount += 1;
  }
  existing.totalMs += durationMs;
  existing.maxMs = Math.max(existing.maxMs, durationMs);
  existing.lastStatus = status;
  existing.samples.push(durationMs);
  if (existing.samples.length > MAX_SAMPLES) {
    existing.samples.shift();
  }

  metrics.set(key, existing);
  maybeCaptureSnapshot();
}

export function getPerformanceMetrics() {
  return Array.from(metrics.entries())
    .map(([key, entry]) => {
      const [method, path] = key.split(" ", 2);
      const sortedSamples = [...entry.samples].sort((a, b) => a - b);
      const p95Index = sortedSamples.length > 0
        ? Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * 0.95))
        : 0;

      return {
        method,
        path,
        count: entry.count,
        errorCount: entry.errorCount,
        averageMs: entry.count > 0 ? Number((entry.totalMs / entry.count).toFixed(1)) : 0,
        p95Ms: Number((sortedSamples[p95Index] ?? 0).toFixed(1)),
        maxMs: Number(entry.maxMs.toFixed(1)),
        lastStatus: entry.lastStatus,
      };
    })
    .sort((a, b) => b.averageMs - a.averageMs);
}

export function getPerformanceActivityMetrics(): ActivityMetric[] {
  const grouped = new Map<string, MetricEntry>();

  for (const [key, entry] of Array.from(metrics.entries())) {
    const [, path] = key.split(" ", 2);
    const activity = classifyActivityPath(path || "");
    const existing = grouped.get(activity) ?? {
      count: 0,
      errorCount: 0,
      totalMs: 0,
      maxMs: 0,
      samples: [],
      lastStatus: entry.lastStatus,
    };

    existing.count += entry.count;
    existing.errorCount += entry.errorCount;
    existing.totalMs += entry.totalMs;
    existing.maxMs = Math.max(existing.maxMs, entry.maxMs);
    existing.lastStatus = entry.lastStatus;
    existing.samples.push(...entry.samples);
    if (existing.samples.length > MAX_SAMPLES) {
      existing.samples = existing.samples.slice(existing.samples.length - MAX_SAMPLES);
    }

    grouped.set(activity, existing);
  }

  return Array.from(grouped.entries())
    .map(([activity, entry]) => {
      const sortedSamples = [...entry.samples].sort((a, b) => a - b);
      const p95Index = sortedSamples.length > 0
        ? Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * 0.95))
        : 0;

      return {
        activity,
        count: entry.count,
        errorCount: entry.errorCount,
        averageMs: entry.count > 0 ? Number((entry.totalMs / entry.count).toFixed(1)) : 0,
        p95Ms: Number((sortedSamples[p95Index] ?? 0).toFixed(1)),
        maxMs: Number(entry.maxMs.toFixed(1)),
        lastStatus: entry.lastStatus,
      };
    })
    .sort((a, b) => b.count - a.count);
}

export function getPerformanceHistory() {
  if (history.length === 0) {
    const now = Date.now();
    lastSnapshotAt = now;
    history.push(buildSnapshot(now));
  } else {
    maybeCaptureSnapshot();
  }
  return [...history];
}

export function resetPerformanceMetrics() {
  metrics.clear();
  history.length = 0;
  lastSnapshotAt = 0;
}

function maybeCaptureSnapshot() {
  const now = Date.now();
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) {
    return;
  }
  lastSnapshotAt = now;
  history.push(buildSnapshot(now));
  if (history.length > HISTORY_LIMIT) {
    history.shift();
  }
}

function buildSnapshot(now: number): PerformanceSnapshot {
  let totalRequests = 0;
  let totalFailures = 0;
  let weightedLatency = 0;
  let weight = 0;
  let peakP95 = 0;

  for (const entry of Array.from(metrics.values())) {
    totalRequests += entry.count;
    totalFailures += entry.errorCount;
    weightedLatency += entry.totalMs;
    weight += entry.count;

    const sortedSamples = [...entry.samples].sort((a, b) => a - b);
    const p95Index = sortedSamples.length > 0
      ? Math.min(sortedSamples.length - 1, Math.floor(sortedSamples.length * 0.95))
      : 0;
    peakP95 = Math.max(peakP95, sortedSamples[p95Index] ?? 0);
  }

  return {
    capturedAt: new Date(now).toISOString(),
    totalRequests,
    totalFailures,
    weightedAverageMs: weight > 0 ? Number((weightedLatency / weight).toFixed(1)) : 0,
    peakP95: Number(peakP95.toFixed(1)),
  };
}

function classifyActivityPath(path: string) {
  if (path.startsWith("/api/votes")) return "voting";
  if (path.startsWith("/api/register")) return "registration";
  if (path.startsWith("/api/login") || path.startsWith("/api/logout")) return "authentication";
  if (path.startsWith("/api/user")) return "account";
  if (path.startsWith("/api/voters")) return "user_management";
  if (path.startsWith("/api/candidates")) return "candidate_workflow";
  if (path.startsWith("/api/elections")) return "election_management";
  if (path.startsWith("/api/analytics")) return "analytics_background";
  if (path.startsWith("/api/audit-logs") || path.startsWith("/api/performance")) return "system_processing";
  return "other_processing";
}
