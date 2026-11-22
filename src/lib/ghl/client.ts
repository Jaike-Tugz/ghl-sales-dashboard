/**
 * Minimal, READ-ONLY HighLevel API v2 client.
 *
 * Source of truth for every path, version header and scope used here:
 * github.com/GoHighLevel/highlevel-api-docs (apps/*.json OpenAPI specs) —
 * see docs/GHL_INTEGRATION.md for the verified list.
 *
 * Safety: the only non-GET request this client can make is to an explicit
 * allow-list of read endpoints that happen to use POST (none at present
 * beyond OAuth, which lives in oauth.ts). Anything else throws before a
 * request is sent, so the dashboard cannot modify GHL records.
 *
 * Rate limits (official): 100 requests / 10 s and 200,000 / day per app per
 * location. We pace to ~8 req/s per location, honour X-RateLimit-Remaining,
 * and back off exponentially on 429 / 5xx.
 */

export const GHL_API_BASE = "https://services.leadconnectorhq.com";

/** Version header values from the official spec, per API family. */
export const GHL_VERSION = {
  default: "2021-07-28",
  calendars: "2021-04-15",
  conversations: "2021-04-15",
} as const;

const READ_ONLY_POST_ALLOW_LIST: RegExp[] = [];

export class GhlApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public path: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "GhlApiError";
  }
  get isAuthError() {
    return this.status === 401 || this.status === 403;
  }
}

interface Pacer {
  nextAt: number;
  pausedUntil: number;
}
const pacers = new Map<string, Pacer>();
const MIN_INTERVAL_MS = 125;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pace(key: string) {
  const p = pacers.get(key) ?? { nextAt: 0, pausedUntil: 0 };
  pacers.set(key, p);
  const now = Date.now();
  const at = Math.max(now, p.nextAt, p.pausedUntil);
  p.nextAt = at + MIN_INTERVAL_MS;
  if (at > now) await sleep(at - now);
}

export interface GhlRequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  version?: string;
  maxRetries?: number;
  fetchImpl?: typeof fetch;
}

export interface GhlClient {
  locationId: string;
  get<T>(path: string, opts?: Omit<GhlRequestOptions, "method" | "body">): Promise<T>;
  requestCount(): number;
}

export function createGhlClient(locationId: string, getToken: () => Promise<string>, onAuthFailure?: () => Promise<string | null>): GhlClient {
  let count = 0;

  async function request<T>(path: string, opts: GhlRequestOptions = {}): Promise<T> {
    const method = opts.method ?? "GET";
    if (method !== "GET" && !READ_ONLY_POST_ALLOW_LIST.some((r) => r.test(path))) {
      throw new Error(`Refusing ${method} ${path}: the GHL client is read-only`);
    }
    const url = new URL(path, GHL_API_BASE);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    const maxRetries = opts.maxRetries ?? 5;
    const doFetch = opts.fetchImpl ?? fetch;
    let token = await getToken();
    let refreshed = false;

    for (let attempt = 0; ; attempt++) {
      await pace(locationId);
      count++;
      let res: Response;
      try {
        res = await doFetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Version: opts.version ?? GHL_VERSION.default,
            Accept: "application/json",
            ...(opts.body ? { "Content-Type": "application/json" } : {}),
          },
          body: opts.body ? JSON.stringify(opts.body) : undefined,
          cache: "no-store",
        });
      } catch (err) {
        if (attempt >= maxRetries) throw new GhlApiError(`Network error: ${(err as Error).message}`, 0, path);
        await sleep(backoff(attempt));
        continue;
      }

      const remainingHeader = res.headers.get("x-ratelimit-remaining");
      const remaining = remainingHeader == null ? NaN : Number(remainingHeader);
      const intervalMs = Number(res.headers.get("x-ratelimit-interval-milliseconds")) || 10_000;
      if (Number.isFinite(remaining) && remaining <= 2) {
        const p = pacers.get(locationId);
        if (p) p.pausedUntil = Date.now() + intervalMs;
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        return (await res.json()) as T;
      }

      const body = await res.json().catch(() => undefined);
      if (res.status === 401 && onAuthFailure && !refreshed) {
        refreshed = true;
        const next = await onAuthFailure();
        if (next) {
          token = next;
          continue;
        }
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt));
        continue;
      }
      const msg = (body as { message?: string } | undefined)?.message ?? res.statusText;
      throw new GhlApiError(`GHL ${res.status} on ${path}: ${Array.isArray(msg) ? msg.join(", ") : msg}`, res.status, path, body);
    }
  }

  return {
    locationId,
    get: (path, opts) => request(path, { ...opts, method: "GET" }),
    requestCount: () => count,
  };
}

function backoff(attempt: number) {
  return Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
