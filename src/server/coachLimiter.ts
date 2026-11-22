type Limit = { count: number; resetAt: number };

/** Per-process protection only. A shared edge limiter and provider budgets are still required. */
export function createCoachLimiter() {
  const visitors = new Map<string, Limit>();
  let total: Limit = { count: 0, resetAt: 0 };
  return (client: string, now: number, perMinute: number, perHour: number) => {
    if (now >= total.resetAt) total = { count: 0, resetAt: now + 3600000 };
    let visitor = visitors.get(client);
    if (!visitor || now >= visitor.resetAt) {
      visitor = { count: 0, resetAt: now + 60000 };
      visitors.delete(client);
      visitors.set(client, visitor);
      if (visitors.size > 5000) visitors.delete(visitors.keys().next().value!);
    }
    if (visitor.count >= perMinute || total.count >= perHour) {
      const resetAt =
        visitor.count >= perMinute ? visitor.resetAt : total.resetAt;
      return {
        allowed: false,
        retryAfter: Math.max(1, Math.ceil((resetAt - now) / 1000)),
      };
    }
    visitor.count++;
    total.count++;
    return { allowed: true, retryAfter: 0 };
  };
}

export function coachLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 10000
    ? parsed
    : fallback;
}
