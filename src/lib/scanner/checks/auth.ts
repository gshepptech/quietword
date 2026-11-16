import type { ScanContext } from "../context";
import type { CheckResult, Evidence } from "../types";
import { type Check, notChecked, pathOf, result, snippet } from "./shared";

/** Tried when the frontend bundle gave nothing away. */
export const COMMON_API_PATHS = [
  "/api/users",
  "/api/user",
  "/api/me",
  "/api/customers",
  "/api/orders",
  "/api/admin",
  "/api/messages",
  "/api/subscribers",
  "/api/leads",
  "/api/waitlist",
  "/api/submissions",
  "/api/data",
  "/api/profile",
  "/api/todos",
  "/api/posts",
];

/** Routes tested per scan, discovered ones first. */
const MAX_PROBES = 8;

function randomPath(): string {
  return Math.random().toString(36).slice(2, 12);
}

/**
 * An address invented on the spot, asked for before anything else, so the check
 * knows what "this route does not exist" looks like on this particular app.
 */
function controlPath(): string {
  return `/api/${randomPath()}`;
}

/**
 * True when the app demanded a login for an address that cannot exist.
 *
 * Sites behind a single gate, a Cloudflare Access rule or a password on a
 * preview deployment, answer 401 for every path there is. Without this, every
 * guessed name in `COMMON_API_PATHS` comes back "protected", the check counts
 * routes that were never there, and it reports a clean result built on them.
 * That is the false pass this codebase exists to avoid.
 */
function isGated(control: { ok: boolean; status?: number }): boolean {
  if (!control.ok) return false;
  return control.status === 401 || control.status === 403;
}

/**
 * Field names that say "this is somebody's personal information" loudly enough
 * to act on. A `200` on its own is not a finding: plenty of API routes are
 * public on purpose, and calling those a problem would bury the real one.
 */
const SENSITIVE_FIELDS = [
  "email",
  "email_address",
  "emailaddress",
  "password",
  "password_hash",
  "passwordhash",
  "hashed_password",
  "phone",
  "phone_number",
  "phonenumber",
  "mobile",
  "ssn",
  "social_security_number",
  "date_of_birth",
  "dob",
  "credit_card",
  "card_number",
  "iban",
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "session_token",
  "stripe_customer_id",
  "customer_id",
  "address_line1",
  "street_address",
];

const EMAIL_VALUE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PLACEHOLDER_DOMAINS = ["example.com", "example.org", "test.com", "sentry.io", "w3.org"];

export interface PayloadAssessment {
  /** True when the response looks like an API returning records. */
  isData: boolean;
  /** Plain-language reasons this looks like personal information. */
  signals: string[];
  recordCount: number;
}

function collectKeys(value: unknown, into: Set<string>, depth = 0): void {
  if (depth > 4 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 20)) collectKeys(item, into, depth + 1);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    into.add(key.toLowerCase());
    collectKeys(child, into, depth + 1);
  }
}

const COLLECTION_KEYS = ["data", "items", "results", "rows", "records", "users", "list"];

/**
 * Decide whether an unauthenticated response is a data endpoint, and whether
 * what came back is somebody's personal information.
 */
export function assessPayload(body: string, contentType: string): PayloadAssessment {
  const looksJson = /json/i.test(contentType) || /^\s*[[{]/.test(body);
  if (!looksJson || body.trim().length === 0) {
    return { isData: false, signals: [], recordCount: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { isData: false, signals: [], recordCount: 0 };
  }

  let records: unknown[] = [];
  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (parsed !== null && typeof parsed === "object") {
    const asObject = parsed as Record<string, unknown>;
    for (const key of COLLECTION_KEYS) {
      const value = asObject[key];
      if (Array.isArray(value)) {
        records = value;
        break;
      }
    }
    if (records.length === 0) records = [parsed];
  }

  const objectRecords = records.filter((r) => r !== null && typeof r === "object");
  const keys = new Set<string>();
  collectKeys(parsed, keys);

  const isData = objectRecords.length > 0 && keys.size >= 2;
  if (!isData) return { isData: false, signals: [], recordCount: 0 };

  const signals: string[] = [];
  const matchedFields = SENSITIVE_FIELDS.filter((field) => keys.has(field));
  if (matchedFields.length > 0) {
    signals.push(`fields named ${matchedFields.slice(0, 4).join(", ")}`);
  }

  const emails = new Set(
    [...body.matchAll(EMAIL_VALUE)]
      .map((m) => m[0].toLowerCase())
      .filter((address) => !PLACEHOLDER_DOMAINS.some((domain) => address.endsWith(`@${domain}`))),
  );
  if (emails.size > 0) {
    signals.push(`${emails.size} email ${emails.size === 1 ? "address" : "addresses"} in the response`);
  }

  return { isData: true, signals, recordCount: objectRecords.length };
}

export type RouteOutcome =
  | { path: string; state: "open"; signals: string[]; recordCount: number; sample: string }
  | { path: string; state: "open_public" }
  | { path: string; state: "protected"; status: number }
  | { path: string; state: "absent" }
  | { path: string; state: "unclear"; note: string };

const TITLE = "Data your app hands out without asking who you are";

const METHOD_BASE =
  "Quietword asked your API routes for data the way a stranger would, with no login and no cookies, and looked at what came back. A route that answers is only reported when the answer contains personal information such as email addresses. Plenty of routes are open on purpose, and those are not treated as a problem.";

function candidatePaths(ctx: ScanContext): { paths: string[]; discovered: number } {
  const discovered = ctx.collected.apiPaths;
  const merged = [...discovered];
  for (const path of COMMON_API_PATHS) {
    if (!merged.includes(path)) merged.push(path);
  }
  return { paths: merged.slice(0, MAX_PROBES), discovered: discovered.length };
}

/**
 * Says where the routes it tested came from. The counts pull apart easily:
 * discovery can turn up more routes than `MAX_PROBES` leaves room for, and the
 * budget can stop the loop earlier still, so the number found in the code is
 * often larger than the number actually asked. Reporting the discovery total as
 * though it were the tested total reads as arithmetic that does not add up, and
 * claiming common names were tried when there was no room for any is a claim
 * about work that never happened.
 */
export function describeCoverage(tested: number, fromCode: number, discovered: number): string {
  const addresses = `${tested} ${tested === 1 ? "address" : "addresses"}`;
  const untested = discovered - fromCode;
  const overflow =
    untested > 0
      ? ` It found ${untested} more in the code than it had room to test in one scan.`
      : "";

  if (fromCode === 0) {
    return ` It tested ${addresses}, all of them common names rather than anything found in your app's own code.${overflow}`;
  }
  if (fromCode === tested) {
    return ` It tested ${addresses}, all of them found by reading your app's own code.${overflow}`;
  }
  return ` It tested ${addresses}. ${fromCode} of them ${fromCode === 1 ? "was" : "were"} found by reading your app's own code, and the rest are common names.${overflow}`;
}

export const authCheck: Check = {
  id: "auth",
  title: TITLE,
  async run(ctx: ScanContext): Promise<CheckResult> {
    const { paths, discovered } = candidatePaths(ctx);
    const outcomes: RouteOutcome[] = [];

    const control = controlPath();
    const controlResponse = ctx.budget.exhausted()
      ? { ok: false as const }
      : await ctx.visit(ctx.origin + control);

    if (isGated(controlResponse)) {
      const status = controlResponse.ok ? controlResponse.status : 0;
      return notChecked("auth", TITLE, {
        headline: "Your app asks for a login before it answers anything, so single routes could not be tested.",
        why: "Every address Quietword tried came back asking for a login, including one it made up on the spot that cannot exist on your app. An answer that is the same for real addresses and invented ones says nothing about either.",
        nextStep:
          "Nothing to do here if the login gate is meant to be there. If you expected visitors to reach your app without signing in, the gate is the thing to look at, and this check is worth running again once it is off.",
        method: `${METHOD_BASE} It began by asking for an address it made up on the spot, to learn what your app says about an address that does not exist.`,
        evidence: [
          {
            label: control,
            detail: `Made up for this scan and answered with ${status}, the same as the addresses that might have been real.`,
          },
        ],
      });
    }

    for (const path of paths) {
      if (ctx.budget.exhausted()) break;
      const response = await ctx.visit(ctx.origin + path);

      if (!response.ok) {
        outcomes.push({ path, state: "unclear", note: response.message });
        continue;
      }

      const status = response.status;
      if (status === 401 || status === 403) {
        outcomes.push({ path, state: "protected", status });
        continue;
      }
      if (status === 404 || status === 410) {
        outcomes.push({ path, state: "absent" });
        continue;
      }
      if (status >= 500) {
        outcomes.push({ path, state: "unclear", note: `answered with a ${status} error` });
        continue;
      }

      const contentType = response.headers["content-type"] ?? "";
      if (/text\/html/i.test(contentType)) {
        // Single page apps serve their HTML shell for anything they do not
        // recognise, so an HTML answer means there is no API route here.
        outcomes.push({ path, state: "absent" });
        continue;
      }

      const assessment = assessPayload(response.body, contentType);
      if (!assessment.isData) {
        outcomes.push({ path, state: "absent" });
        continue;
      }
      if (assessment.signals.length === 0) {
        outcomes.push({ path, state: "open_public" });
        continue;
      }
      outcomes.push({
        path,
        state: "open",
        signals: assessment.signals,
        recordCount: assessment.recordCount,
        sample: snippet(response.body, 160),
      });
    }

    const tested = outcomes.length;
    const open = outcomes.filter((o): o is Extract<RouteOutcome, { state: "open" }> => o.state === "open");
    const protectedRoutes = outcomes.filter((o) => o.state === "protected");
    const publicRoutes = outcomes.filter((o) => o.state === "open_public");
    const existing = open.length + protectedRoutes.length + publicRoutes.length;

    const fromCode = outcomes.filter((o) => ctx.collected.apiPaths.includes(o.path)).length;
    const method = `${METHOD_BASE}${describeCoverage(tested, fromCode, discovered)}`;

    if (tested === 0) {
      return notChecked("auth", TITLE, {
        headline: "Quietword ran out of room before it could test any API routes.",
        why: "This check needs to make several requests, and the scan reached its limit first.",
        nextStep: "Run the scan again in a few minutes.",
        method,
      });
    }

    if (existing === 0) {
      return notChecked("auth", TITLE, {
        headline: "Quietword could not find any API routes to test from the outside.",
        why: "Nothing answered at the addresses it tried, so there is nothing to report either way. This is not the same as your app being safe.",
        nextStep:
          "If your app does have a backend, its routes are named in a way Quietword did not guess. Worth a human look, since this is the check that most often finds real problems.",
        method,
      });
    }

    if (open.length > 0) {
      const evidence: Evidence[] = open.map((route) => ({
        label: route.path,
        detail: `Returned ${route.recordCount} ${route.recordCount === 1 ? "record" : "records"} to a request with no login, including ${route.signals.join(" and ")}. First part of the answer: ${route.sample}`,
      }));

      return result("auth", TITLE, {
        verdict: "attention",
        confidence: "high",
        headline:
          open.length === 1
            ? "One address in your app returns people's information to anyone who asks for it."
            : `${open.length} addresses in your app return people's information to anyone who asks for them.`,
        why: "Anyone who knows the address can read this in a browser. They do not need an account, and nothing in your app records that they took it.",
        nextStep:
          "Add a login check at the top of each of these routes so they only answer when the request carries a valid session, and only return the rows that belong to that person. If you are using Supabase or Firebase, this usually means turning on row-level security as well as checking the session.",
        method,
        evidence,
      });
    }

    const evidence: Evidence[] = [
      ...protectedRoutes.map((route) => ({
        label: route.path,
        detail: "Asked for a login before answering.",
      })),
      ...publicRoutes.map((route) => ({
        label: route.path,
        detail: "Answered without a login, but nothing personal was in the answer.",
      })),
    ];

    return result("auth", TITLE, {
      verdict: "pass",
      confidence: "medium",
      headline: `None of the ${existing} API ${existing === 1 ? "address" : "addresses"} Quietword found handed over personal information to a stranger.`,
      why: "This is the gap that most often goes wrong in apps built quickly, so a clean result here is the most useful one on the list.",
      nextStep:
        "Medium confidence, because Quietword only tested routes your homepage refers to plus a list of common names. Routes reached only from a page behind a login were not tested.",
      method,
      evidence,
    });
  },
};
