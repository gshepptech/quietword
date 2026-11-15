/**
 * A check reports one of three things. `not_checked` is not a soft failure, it
 * is the honest answer when the check could not gather the evidence it needs.
 * Reporting `pass` in that situation is the worst bug this codebase can have.
 */
export type Verdict = "pass" | "attention" | "not_checked";

/**
 * How much the result should be trusted. Reported to the user, because the five
 * checks are not equally certain and pretending otherwise is its own lie.
 */
export type Confidence = "high" | "medium" | "low";

export type CheckId = "secrets" | "auth" | "rate_limit" | "errors" | "https";

export interface Evidence {
  /** Short label, e.g. the path or header the finding came from. */
  label: string;
  /** The supporting detail. Credentials are redacted before they get here. */
  detail: string;
}

export interface CheckResult {
  id: CheckId;
  /** Sentence case, plain language, no jargon. */
  title: string;
  verdict: Verdict;
  confidence: Confidence;
  /** One sentence: what came back. */
  headline: string;
  /** One or two sentences: why it matters to this person's app. */
  why: string;
  /** What to do next. Always present, including on a pass. */
  nextStep: string;
  /** What the scanner actually did, so the result can be argued with. */
  method: string;
  evidence: Evidence[];
}

export interface ScanReport {
  target: string;
  /** Whether the user opted in to the checks that send POST requests. */
  active: boolean;
  startedAt: string;
  durationMs: number;
  checks: CheckResult[];
  summary: {
    attention: number;
    passed: number;
    notChecked: number;
  };
  budget: {
    requestsUsed: number;
    requestLimit: number;
    /** True when the scan hit a wall clock or request ceiling before finishing. */
    ranOut: boolean;
  };
}
