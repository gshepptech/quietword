/**
 * Who to charge a scan against.
 *
 * The leftmost value of `x-forwarded-for` is whatever the client sent. Proxies
 * append rather than replace, so a caller who sets that header picks their own
 * identity, and the per-IP limit stops existing. That matters more here than in
 * most applications: this service sends bursts of requests at whatever address
 * it is given, so an unlimited caller turns it into a relay aimed at other
 * people's servers.
 *
 * So prefer a header the platform sets after discarding anything the client
 * sent, and otherwise refuse to believe the client at all.
 */

/** Set by the platform itself. A client cannot forge these. */
const PLATFORM_HEADERS = [
  "x-vercel-forwarded-for",
  "cf-connecting-ip",
  "fly-client-ip",
  "true-client-ip",
];

/**
 * How many proxies sit in front of this app. Zero, the default, means
 * `x-forwarded-for` is not believed at all. Set it only when you know the
 * number, because guessing high hands the caller their identity back.
 */
function trustedHops(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env["TRUSTED_PROXY_HOPS"] ?? "0");
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
}

/**
 * Returns the key the rate limiter counts against. When nothing trustworthy is
 * present, every caller shares one bucket: a limit that is too strict still
 * limits, and a bucket the caller chooses does not.
 */
export function clientKey(request: Request, env: NodeJS.ProcessEnv = process.env): string {
  for (const header of PLATFORM_HEADERS) {
    const value = request.headers.get(header)?.trim();
    if (value) return value;
  }

  const hops = trustedHops(env);
  if (hops > 0) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const chain = forwarded.split(",").map((hop) => hop.trim()).filter(Boolean);
      // Count in from the right. The rightmost entries were added by the
      // proxies nearest us, which are the ones a client cannot control.
      const index = chain.length - hops;
      const candidate = chain[index >= 0 ? index : 0];
      if (candidate) return candidate;
    }

    const real = request.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }

  return "untrusted";
}
