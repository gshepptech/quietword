import type { ScanContext } from "../context";
import type { CheckResult, Evidence } from "../types";
import { type Check, notChecked, result } from "./shared";

/**
 * The burst size. Ten is a compromise: enough that any sensibly configured
 * limiter on a login route will answer, few enough that the scan is not
 * hammering somebody's server. It is stated in the report so the user can judge
 * the result for themselves.
 */
export const BURST = 10;

/** Endpoints worth protecting, tried when the bundle gave nothing away. */
export const COMMON_AUTH_PATHS = [
  "/api/auth/login",
  "/api/login",
  "/api/auth/signup",
  "/api/signup",
  "/api/auth/register",
  "/api/auth/forgot-password",
  "/api/forgot-password",
  "/api/waitlist",
  "/api/subscribe",
  "/api/contact",
];

const AUTH_SHAPED = /(login|signin|sign-in|signup|sign-up|register|forgot|reset|password|otp|magic|verify|waitlist|subscribe|contact)/i;

const LIMIT_HEADERS = [
  "retry-after",
  "ratelimit",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-rate-limit-limit",
  "x-rate-limit-remaining",
];

export interface ObservedResponse {
  status: number;
  headers: Record<string, string>;
}

export interface LimiterEvidence {
  limited: boolean;
  reasons: string[];
}

/**
 * A limiter announces itself either by turning a request away with a 429 or by
 * describing its budget in a header. Either is direct evidence, which is why a
 * pass here is high confidence and a finding is not.
 */
export function detectLimiter(responses: ObservedResponse[]): LimiterEvidence {
  const reasons: string[] = [];

  const refused = responses.filter((r) => r.status === 429).length;
  if (refused > 0) {
    reasons.push(`${refused} of ${responses.length} requests were turned away with a "too many requests" answer`);
  }

  const headers = new Set<string>();
  for (const response of responses) {
    for (const name of LIMIT_HEADERS) {
      if (response.headers[name] !== undefined) headers.add(name);
    }
  }
  if (headers.size > 0) {
    reasons.push(`the server sent rate limit headers (${[...headers].sort().join(", ")})`);
  }

  return { limited: reasons.length > 0, reasons };
}

/** Deliberately invalid, and obviously so to anyone reading their logs. */
const PROBE_BODY = JSON.stringify({
  email: "greenlit-scan@example.com",
  password: "this-is-not-a-real-password",
});

const TITLE = "Limits on how fast someone can guess passwords";

const METHOD_BASE = `Greenlit found the addresses your app uses for things like signing in or signing up, then sent ${BURST} requests to one of them in a row with a deliberately wrong email and password. It watched for the server turning requests away or telling it how many were left. Nothing resembling a real account was touched.`;

function pickEndpoint(ctx: ScanContext): string[] {
  const discovered = ctx.collected.apiPaths.filter((path) => AUTH_SHAPED.test(path));
  const merged = [...discovered];
  for (const path of COMMON_AUTH_PATHS) {
    if (!merged.includes(path)) merged.push(path);
  }
  return merged;
}

export const rateLimitCheck: Check = {
  id: "rate_limit",
  title: TITLE,
  async run(ctx: ScanContext): Promise<CheckResult> {
    const candidates = pickEndpoint(ctx);
    const observed: ObservedResponse[] = [];
    let endpoint: string | null = null;
    let attempts = 0;
    let lastFailure: string | null = null;

    // Find one endpoint that exists. Four tries, then give up rather than spend
    // the whole budget looking.
    for (const path of candidates.slice(0, 4)) {
      if (ctx.budget.exhausted()) break;
      const response = await ctx.visit(ctx.origin + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: PROBE_BODY,
      });

      if (!response.ok) {
        lastFailure = response.message;
        continue;
      }
      if (response.status === 404 || response.status === 410) continue;
      if (/text\/html/i.test(response.headers["content-type"] ?? "")) continue;

      endpoint = path;
      observed.push({ status: response.status, headers: response.headers });
      attempts = 1;
      break;
    }

    if (!endpoint) {
      return notChecked("rate_limit", TITLE, {
        headline: "Greenlit could not find a sign-in or sign-up address to test.",
        why: "Without an endpoint to send requests to there is nothing to measure, and reporting a pass would be inventing a result.",
        nextStep: lastFailure
          ? `If your app does have a login, its address is named in a way Greenlit did not guess. Greenlit last saw: ${lastFailure}.`
          : "If your app has a login, a signup, or a password reset, ask whoever reviews it to test those directly.",
        method: METHOD_BASE,
      });
    }

    for (let i = attempts; i < BURST; i += 1) {
      if (ctx.budget.exhausted()) break;
      const response = await ctx.visit(ctx.origin + endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: PROBE_BODY,
        skipBody: true,
      });
      if (!response.ok) break;
      attempts += 1;
      observed.push({ status: response.status, headers: response.headers });
      if (response.status === 429) break;
    }

    const method = `${METHOD_BASE} It tested ${endpoint} and got ${attempts} ${attempts === 1 ? "answer" : "answers"} back.`;

    if (attempts < 3) {
      return notChecked("rate_limit", TITLE, {
        headline: `Greenlit only managed ${attempts} ${attempts === 1 ? "request" : "requests"} to ${endpoint}, which is not enough to tell.`,
        why: "The requests stopped early, so there is no way to know whether a limit exists or the server simply stopped answering.",
        nextStep: "Run the scan again in a few minutes.",
        method,
      });
    }

    const evidenceFound = detectLimiter(observed);
    const statuses = [...new Set(observed.map((o) => o.status))].sort((a, b) => a - b);

    if (evidenceFound.limited) {
      const evidence: Evidence[] = evidenceFound.reasons.map((reason) => ({
        label: endpoint,
        detail: reason.charAt(0).toUpperCase() + reason.slice(1) + ".",
      }));

      return result("rate_limit", TITLE, {
        verdict: "pass",
        confidence: "high",
        headline: `Your ${endpoint} address starts refusing requests when they come too fast.`,
        why: "That is what stops someone running through a list of stolen passwords against your login, and what stops your password reset email being used to spam people.",
        nextStep:
          "Nothing to do here. If you add another sign-in route later, give it the same treatment.",
        method,
        evidence,
      });
    }

    return result("rate_limit", TITLE, {
      verdict: "attention",
      confidence: "medium",
      headline: `Greenlit sent ${attempts} sign-in attempts to ${endpoint} in a row and none of them were turned away.`,
      why: "With no limit, someone can run through millions of common passwords against your login, or fire your password reset email at the same address over and over.",
      nextStep:
        "Add a rate limit to your sign-in, sign-up, and password reset routes. Five to ten attempts per address every fifteen minutes is a normal setting. Most hosts have this built in, and Upstash Ratelimit is a common choice if yours does not.",
      method,
      evidence: [
        {
          label: endpoint,
          detail: `All ${attempts} requests were answered, with ${statuses.length === 1 ? "the same result" : "results"} ${statuses.join(", ")}. No rate limit headers were sent.`,
        },
        {
          label: "Worth knowing",
          detail: `Medium confidence. A limit set higher than ${BURST} attempts would not show up in a test this small, so this may be a limit Greenlit could not reach rather than no limit at all.`,
        },
      ],
    });
  },
};
