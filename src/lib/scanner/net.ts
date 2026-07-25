import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { Agent, request } from "undici";

import { blockedHostnameReason, blockedReason } from "./addresses";

export const LIMITS = {
  /** Total outbound requests one scan may make, redirect hops included. */
  requests: 40,
  /** Wall clock for the whole scan. */
  totalMs: 25_000,
  /** Ceiling for any single request. */
  perRequestMs: 8_000,
  /** Bytes read from one response before the stream is cut. */
  bytesPerResponse: 1_500_000,
  /** Bytes read across the whole scan. */
  bytesTotal: 6_000_000,
  /** Redirect hops followed by hand, each one revalidated. */
  redirects: 4,
} as const;

export const USER_AGENT = (() => {
  const contact = process.env.SCANNER_CONTACT_URL?.trim();
  return contact ? `GreenlitScanner/0.1 (+${contact})` : "GreenlitScanner/0.1";
})();

export class BlockedAddressError extends Error {
  constructor(hostname: string, address: string, reason: string) {
    super(`${hostname} resolves to ${address}, which is in ${reason}`);
    this.name = "BlockedAddressError";
  }
}

/**
 * The denylist check runs here, inside the socket's own DNS lookup, and not as
 * a separate step before the request. Validating a hostname and then handing it
 * to a fetch leaves a window where DNS can answer the validator with a public
 * address and the socket with a private one. Doing it here means the address
 * that gets connected to is the address that got checked.
 *
 * If any address the hostname resolves to is blocked, the whole connection
 * fails. Not "pick a different one": a host that answers with 10.0.0.1 among
 * its records is not a host worth scanning.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  const hostReason = blockedHostnameReason(hostname);
  if (hostReason) {
    callback(new BlockedAddressError(hostname, hostname, hostReason), []);
    return;
  }

  dns.lookup(hostname, { all: true, verbatim: true }, (err, addresses) => {
    if (err) {
      callback(err, []);
      return;
    }

    for (const entry of addresses) {
      const reason = blockedReason(entry.address);
      if (reason) {
        callback(new BlockedAddressError(hostname, entry.address, reason), []);
        return;
      }
    }

    const requested = options.family;
    const family = requested === "IPv4" ? 4 : requested === "IPv6" ? 6 : requested;
    const usable =
      family === 4 || family === 6 ? addresses.filter((a) => a.family === family) : addresses;

    if (usable.length === 0) {
      const noAddress: NodeJS.ErrnoException = new Error(`no usable address for ${hostname}`);
      noAddress.code = "ENOTFOUND";
      callback(noAddress, []);
      return;
    }

    if (options.all) {
      callback(null, usable);
      return;
    }
    callback(null, usable[0]!.address, usable[0]!.family);
  });
};

export function createDispatcher(): Agent {
  return new Agent({
    connect: { lookup: guardedLookup, timeout: LIMITS.perRequestMs },
    connections: 4,
    pipelining: 0,
    headersTimeout: LIMITS.perRequestMs,
    bodyTimeout: LIMITS.perRequestMs,
  });
}

export type BudgetStop = "requests" | "time" | "bytes";

/**
 * Shared ceiling for one scan. Checks ask before they spend, so a check that
 * arrives after the budget is gone reports `not_checked` rather than silently
 * doing nothing and looking like a pass.
 */
export class ScanBudget {
  readonly startedAt = Date.now();
  requestsUsed = 0;
  bytesUsed = 0;
  private stopped: BudgetStop | null = null;

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }

  get remainingMs(): number {
    return Math.max(0, LIMITS.totalMs - this.elapsedMs);
  }

  /** Why the budget is gone, or null while there is room left. */
  exhausted(): BudgetStop | null {
    if (this.stopped) return this.stopped;
    if (this.requestsUsed >= LIMITS.requests) return (this.stopped = "requests");
    if (this.remainingMs <= 250) return (this.stopped = "time");
    if (this.bytesUsed >= LIMITS.bytesTotal) return (this.stopped = "bytes");
    return null;
  }

  spendRequest(): void {
    this.requestsUsed += 1;
  }

  spendBytes(count: number): void {
    this.bytesUsed += count;
  }
}

export const BUDGET_REASON: Record<BudgetStop, string> = {
  requests: "the scan reached its request limit before this check ran",
  time: "the scan ran out of time before this check finished",
  bytes: "the scan reached its download limit before this check ran",
};

export interface ProbeResponse {
  ok: true;
  /** The URL that finally answered, after any redirects. */
  url: string;
  requestedUrl: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyTruncated: boolean;
  /** Every URL in the redirect chain, first request first. */
  chain: string[];
}

export type ProbeFailure = {
  ok: false;
  requestedUrl: string;
  kind: "blocked" | "timeout" | "network" | "budget" | "too_many_redirects";
  message: string;
};

export type Probe = ProbeResponse | ProbeFailure;

export interface ProbeOptions {
  method?: "GET" | "POST" | "HEAD";
  headers?: Record<string, string>;
  body?: string;
  /** Skip reading the body. Used when only status and headers matter. */
  skipBody?: boolean;
  followRedirects?: boolean;
  /** Tighter than the default, for probes where a slow answer is still an answer. */
  timeoutMs?: number;
}

const TEXTUAL = /^(text\/|application\/(json|javascript|xml|x-javascript|ld\+json|problem\+json))/i;

/**
 * One guarded request. Redirects are followed by hand so every hop is a fresh
 * validated connection: a 302 pointing at 169.254.169.254 fails exactly the way
 * a direct request to it would.
 */
export async function probe(
  dispatcher: Agent,
  target: string,
  budget: ScanBudget,
  options: ProbeOptions = {},
): Promise<Probe> {
  const chain: string[] = [];
  let current = target;
  const follow = options.followRedirects ?? true;

  for (let hop = 0; hop <= LIMITS.redirects; hop += 1) {
    const stop = budget.exhausted();
    if (stop) {
      return { ok: false, requestedUrl: target, kind: "budget", message: BUDGET_REASON[stop] };
    }

    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return { ok: false, requestedUrl: target, kind: "network", message: `${current} is not a usable address` };
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return {
        ok: false,
        requestedUrl: target,
        kind: "blocked",
        message: `redirected to ${parsed.protocol} which the scanner does not follow`,
      };
    }

    // Node skips the DNS lookup entirely when the host is already an IP
    // literal, so `guardedLookup` never sees `http://169.254.169.254/`. This is
    // the gate that catches those, and it runs on every redirect hop as well as
    // the first request.
    const hostReason = blockedHostnameReason(parsed.hostname);
    if (hostReason) {
      return {
        ok: false,
        requestedUrl: target,
        kind: "blocked",
        message: `${parsed.hostname} is ${hostReason}, which the scanner will not connect to`,
      };
    }

    chain.push(current);
    budget.spendRequest();

    const controller = new AbortController();
    const deadline = Math.min(
      options.timeoutMs ?? LIMITS.perRequestMs,
      LIMITS.perRequestMs,
      Math.max(500, budget.remainingMs),
    );
    const timer = setTimeout(() => controller.abort(), deadline);

    try {
      const response = await request(current, {
        dispatcher,
        method: options.method ?? "GET",
        signal: controller.signal,
        headers: {
          "user-agent": USER_AGENT,
          accept: "*/*",
          "accept-encoding": "identity",
          ...options.headers,
        },
        ...(options.body === undefined ? {} : { body: options.body }),
      });

      const headers = flattenHeaders(response.headers);
      const status = response.statusCode;

      if (follow && status >= 300 && status < 400 && headers["location"]) {
        discard(response.body);
        if (hop === LIMITS.redirects) {
          return {
            ok: false,
            requestedUrl: target,
            kind: "too_many_redirects",
            message: `stopped after ${LIMITS.redirects} redirects`,
          };
        }
        current = new URL(headers["location"], current).toString();
        continue;
      }

      const contentType = headers["content-type"] ?? "";
      const wantsBody = !options.skipBody && (contentType === "" || TEXTUAL.test(contentType));
      const { text, truncated } = wantsBody
        ? await readCapped(response.body, budget)
        : (discard(response.body), { text: "", truncated: false });

      return {
        ok: true,
        url: current,
        requestedUrl: target,
        status,
        headers,
        body: text,
        bodyTruncated: truncated,
        chain,
      };
    } catch (error) {
      if (error instanceof BlockedAddressError) {
        return { ok: false, requestedUrl: target, kind: "blocked", message: error.message };
      }
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof BlockedAddressError) {
        return { ok: false, requestedUrl: target, kind: "blocked", message: cause.message };
      }
      if (controller.signal.aborted) {
        return {
          ok: false,
          requestedUrl: target,
          kind: "timeout",
          message: `no answer within ${Math.round(deadline / 1000)} seconds`,
        };
      }
      return { ok: false, requestedUrl: target, kind: "network", message: describe(error) };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    requestedUrl: target,
    kind: "too_many_redirects",
    message: `stopped after ${LIMITS.redirects} redirects`,
  };
}

/**
 * Throw away a response body we are not going to read.
 *
 * Destroying an undici body while the request is still in flight makes the
 * stream emit an AbortError. Nothing is waiting on that stream by this point,
 * so with no listener attached it becomes an uncaught exception and takes the
 * process down. This is the only place that error can appear, and abandoning
 * the body is the intended outcome, so it is swallowed here deliberately rather
 * than anywhere further out.
 */
export function discard(body: unknown): void {
  if (typeof body !== "object" || body === null) return;
  const stream = body as { on?: (event: string, fn: () => void) => void; destroy?: () => void };
  if (typeof stream.on === "function") stream.on("error", () => undefined);
  if (typeof stream.destroy === "function") stream.destroy();
}

function flattenHeaders(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
  }
  return out;
}

/** Exported so the byte cap can be tested without a network. */
export async function readCapped(
  body: AsyncIterable<Buffer | Uint8Array>,
  budget: ScanBudget,
): Promise<{ text: string; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  const room = Math.max(0, Math.min(LIMITS.bytesPerResponse, LIMITS.bytesTotal - budget.bytesUsed));

  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (size + buffer.length > room) {
      chunks.push(buffer.subarray(0, Math.max(0, room - size)));
      size = room;
      truncated = true;
      break;
    }
    chunks.push(buffer);
    size += buffer.length;
  }

  // Stop the transfer rather than draining a body we already decided to cut.
  if (truncated) discard(body);

  budget.spendBytes(size);
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND") return "that hostname does not resolve";
    if (code === "ECONNREFUSED") return "nothing is listening on that port";
    if (code === "ECONNRESET") return "the connection was closed part way through";
    if (code === "CERT_HAS_EXPIRED") return "the TLS certificate has expired";
    if (code?.startsWith("ERR_TLS") || code === "EPROTO") return "the TLS handshake failed";
    return error.message;
  }
  return "the request failed";
}
