import type { ScanContext } from "../context";
import type { CheckId, CheckResult, Confidence, Evidence, Verdict } from "../types";

export interface Check {
  id: CheckId;
  title: string;
  run(ctx: ScanContext): Promise<CheckResult>;
}

export function result(
  id: CheckId,
  title: string,
  fields: {
    verdict: Verdict;
    confidence: Confidence;
    headline: string;
    why: string;
    nextStep: string;
    method: string;
    evidence?: Evidence[];
  },
): CheckResult {
  return { id, title, evidence: [], ...fields };
}

/**
 * The result a check returns when it could not gather what it needed. Every
 * caller has to supply a reason, because "not checked" with no reason reads to
 * a user like the tool gave up, and it should read like the tool was honest.
 */
export function notChecked(
  id: CheckId,
  title: string,
  fields: { headline: string; why: string; nextStep: string; method: string; evidence?: Evidence[] },
): CheckResult {
  return { id, title, verdict: "not_checked", confidence: "low", evidence: [], ...fields };
}

/** Show enough of a value to recognise it, never enough to use it. */
export function redact(value: string): string {
  const head = value.slice(0, 7);
  return `${head}...${value.length} characters`;
}

/** Trim a response body down to something a person can read in a report. */
export function snippet(text: string, limit = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= limit ? clean : `${clean.slice(0, limit)}...`;
}

export function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}
