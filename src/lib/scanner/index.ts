import { collect } from "./collect";
import { createContext, type ScanContext } from "./context";
import { authCheck } from "./checks/auth";
import { errorsCheck } from "./checks/errors";
import { httpsCheck } from "./checks/https";
import { rateLimitCheck } from "./checks/rate-limit";
import { secretsCheck } from "./checks/secrets";
import { type Check, notChecked } from "./checks/shared";
import { BUDGET_REASON, createDispatcher, LIMITS, ScanBudget } from "./net";
import type { CheckResult, ScanReport } from "./types";

export { LIMITS } from "./net";
export { normaliseTarget } from "./url";
export type { CheckResult, ScanReport, Verdict } from "./types";

/** Thrown when the app never answered, which is a wrong address far more often than an outage. */
export class TargetUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TargetUnreachableError";
  }
}

/**
 * The checks that run after the page has been fetched. HTTPS runs before them,
 * because whether the secure version works decides which address the rest of
 * the scan should be looking at.
 */
const LATER_CHECKS: Check[] = [secretsCheck, authCheck, rateLimitCheck, errorsCheck];

/** Report order. Findings people can act on first, HTTPS last because it is usually fine. */
const DISPLAY_ORDER = ["secrets", "auth", "rate_limit", "errors", "https"] as const;

export async function runScan(target: URL): Promise<ScanReport> {
  const startedAt = new Date();
  const budget = new ScanBudget();
  const dispatcher = createDispatcher();
  const ctx = createContext(target, budget, dispatcher);
  const checks: CheckResult[] = [];

  try {
    checks.push(await runSafely(httpsCheck, ctx));

    if (ctx.captured.length === 0) {
      throw new TargetUnreachableError(explainSilence(ctx));
    }

    await collect(ctx);

    for (const check of LATER_CHECKS) {
      const stop = budget.exhausted();
      if (stop) {
        checks.push(
          notChecked(check.id, check.title, {
            headline: "This check did not run.",
            why: `Snaglist stops itself before it puts a load on your app, and ${BUDGET_REASON[stop]}.`,
            nextStep: "Run the scan again in a few minutes.",
            method: "Not run.",
          }),
        );
        continue;
      }
      checks.push(await runSafely(check, ctx));
    }
  } finally {
    await dispatcher.close();
  }

  checks.sort((a, b) => DISPLAY_ORDER.indexOf(a.id) - DISPLAY_ORDER.indexOf(b.id));

  return {
    target: target.origin,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    checks,
    summary: {
      attention: checks.filter((c) => c.verdict === "attention").length,
      passed: checks.filter((c) => c.verdict === "pass").length,
      notChecked: checks.filter((c) => c.verdict === "not_checked").length,
    },
    budget: {
      requestsUsed: budget.requestsUsed,
      requestLimit: LIMITS.requests,
      ranOut: budget.exhausted() !== null,
    },
  };
}

/**
 * A check that throws must never become a pass. It becomes `not_checked` with
 * the reason attached, and the rest of the scan carries on.
 */
async function runSafely(check: Check, ctx: ScanContext): Promise<CheckResult> {
  try {
    return await check.run(ctx);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "an unexpected error";
    return notChecked(check.id, check.title, {
      headline: "This check stopped part way through, so there is no result for it.",
      why: "Snaglist would rather tell you it does not know than guess.",
      nextStep: "Run the scan again. If it keeps happening, this one needs a human.",
      method: `Stopped with: ${detail}`,
    });
  }
}

function explainSilence(ctx: ScanContext): string {
  const blocked = ctx.failures.find((f) => f.kind === "blocked");
  if (blocked) {
    return "That address points at a private or internal network, and Snaglist only scans apps on the public internet.";
  }
  const timeout = ctx.failures.find((f) => f.kind === "timeout");
  if (timeout) {
    return "Your app did not answer in time. Check it is running, then try again.";
  }
  const network = ctx.failures.find((f) => f.kind === "network");
  if (network) {
    return `Snaglist could not reach that address: ${network.message}.`;
  }
  return "Snaglist could not reach that address. Check it is spelled right and the app is live.";
}
