const counters: Map<string, number> = new Map();

export function inc(metric: string, n = 1) {
  counters.set(metric, (counters.get(metric) || 0) + n);
}

export function getMetric(metric: string) {
  return counters.get(metric) ?? 0;
}

export function getAllMetrics() {
  const obj: Record<string, number> = {};
  for (const [k, v] of counters) obj[k] = v;
  return obj;
}
