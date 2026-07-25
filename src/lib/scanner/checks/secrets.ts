import type { ScanContext } from "../context";
import type { CheckResult, Evidence } from "../types";
import { type Check, notChecked, redact, result } from "./shared";

export interface SecretFinding {
  /** Plain-language name of what was found. */
  kind: string;
  /** Redacted. The real value never leaves this module. */
  sample: string;
  /** What someone holding this key could do. */
  impact: string;
}

interface Pattern {
  kind: string;
  regex: RegExp;
  impact: string;
}

/**
 * Every pattern here matches a documented, provider-specific key format. None
 * of them is an entropy guess, because an entropy guess on a minified bundle
 * produces a wall of false alarms and this user has no way to tell which ones
 * are real.
 */
const PATTERNS: Pattern[] = [
  {
    kind: "An AWS access key",
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    impact: "read or delete anything in your AWS account that this key can reach",
  },
  {
    kind: "A live Stripe secret key",
    regex: /\b[sr]k_live_[0-9a-zA-Z]{16,}/g,
    impact: "charge your customers, issue refunds, and read your payment history",
  },
  {
    kind: "An Anthropic API key",
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}/g,
    impact: "run requests on your account and bill them to you",
  },
  {
    kind: "An OpenAI API key",
    regex: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}\b/g,
    impact: "run requests on your account and bill them to you",
  },
  {
    kind: "A GitHub token",
    regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
    impact: "read and push to the repositories this token covers",
  },
  {
    kind: "A Slack token",
    regex: /\bxox[baprse]-[A-Za-z0-9-]{12,}/g,
    impact: "read and post messages in your workspace",
  },
  {
    kind: "A SendGrid API key",
    regex: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
    impact: "send email from your domain",
  },
  {
    kind: "A Resend API key",
    regex: /\bre_[A-Za-z0-9_-]{20,}\b/g,
    impact: "send email from your domain",
  },
  {
    kind: "A private key file",
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    impact: "impersonate your server or decrypt traffic meant for it",
  },
  {
    kind: "A database connection string with a password in it",
    regex: /\b(?:postgresql|postgres|mysql|mongodb\+srv|mongodb|rediss|redis|amqps|amqp):\/\/[^\s"'`<>]{1,80}:[^\s"'`<>@]{1,80}@[^\s"'`<>/]{1,120}/g,
    impact: "connect directly to your database and read or change everything in it",
  },
];

/**
 * Recognised and deliberately not reported. These are meant to be in the
 * browser. Flagging them would be a false alarm, and a false alarm teaches this
 * user to ignore the next result.
 */
export const PUBLIC_BY_DESIGN = [
  "Supabase anon keys",
  "Firebase web config and Google browser API keys",
  "Stripe publishable keys",
  "Sentry and PostHog public keys",
];

const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.([A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

function decodeJwtPayload(segment: string): Record<string, unknown> | null {
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The single highest-value finding for this audience. A Supabase `service_role`
 * key in the browser bypasses row-level security completely, so every row in
 * every table is readable and writable by anyone who opens dev tools. It is
 * detected by decoding the token and reading the claim, not by guessing.
 */
export function findPrivilegedJwts(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(JWT)) {
    const whole = match[0];
    const payload = decodeJwtPayload(match[1] ?? "");
    if (!payload) continue;
    const role = typeof payload["role"] === "string" ? payload["role"] : "";
    if (role !== "service_role") continue;
    if (seen.has(whole)) continue;
    seen.add(whole);
    findings.push({
      kind: "A Supabase service key",
      sample: redact(whole),
      impact:
        "read, change, or delete every row in your database, ignoring any access rules you set up",
    });
  }

  return findings;
}

export function findSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const seen = new Set<string>();

  for (const pattern of PATTERNS) {
    for (const match of text.matchAll(pattern.regex)) {
      const value = match[0];
      if (seen.has(value)) continue;
      seen.add(value);
      findings.push({ kind: pattern.kind, sample: redact(value), impact: pattern.impact });
    }
  }

  for (const finding of findPrivilegedJwts(text)) {
    if (seen.has(finding.sample)) continue;
    seen.add(finding.sample);
    findings.push(finding);
  }

  return findings;
}

const METHOD =
  "Snaglist read your page and the JavaScript files it loads, then looked for key formats that belong to specific services such as Stripe, AWS, Supabase, and GitHub. Keys that are meant to be public are recognised and left alone: " +
  PUBLIC_BY_DESIGN.join(", ") +
  ". This looks at what your app sends to the browser. It does not look at your code repository.";

const TITLE = "Keys and passwords in your app's code";

export const secretsCheck: Check = {
  id: "secrets",
  title: TITLE,
  async run(ctx: ScanContext): Promise<CheckResult> {
    const { bundleText, scripts, page, pageError } = ctx.collected;

    if (!page || bundleText.trim().length === 0) {
      return notChecked("secrets", TITLE, {
        headline: "Snaglist could not read your app's code, so this check did not run.",
        why: "Without the page and its JavaScript there is nothing to look at, and guessing would be worse than saying nothing.",
        nextStep: pageError
          ? `Check the address is right and the app is live. Snaglist got this back: ${pageError}.`
          : "Check the address is right and that the page loads for someone who is not signed in.",
        method: METHOD,
      });
    }

    const findings = findSecrets(bundleText);
    const filesRead = scripts.length;
    const truncated = scripts.some((s) => s.truncated);

    const scope = `Read your page and ${filesRead} JavaScript ${filesRead === 1 ? "file" : "files"}${
      truncated ? ", one of which was too large to read all the way through" : ""
    }.`;

    if (findings.length > 0) {
      const evidence: Evidence[] = findings.map((f) => ({
        label: f.kind,
        detail: `Found in your app's code (${f.sample}). Someone who copies it can ${f.impact}.`,
      }));

      return result("secrets", TITLE, {
        verdict: "attention",
        confidence: "high",
        headline: `Your app sends ${findings.length === 1 ? "a key" : `${findings.length} keys`} to the browser that ${findings.length === 1 ? "was" : "were"} meant to stay on your server.`,
        why: "Anything your app sends to the browser can be read by anyone who visits it. No tools needed beyond the ones built into a web browser.",
        nextStep:
          "Treat each key as public from now on. Rotate it in the service that issued it, move it to a server-side environment variable, and redeploy. Rotating matters more than hiding it, because the old value may already have been copied.",
        method: `${METHOD} ${scope}`,
        evidence,
      });
    }

    return result("secrets", TITLE, {
      verdict: "pass",
      confidence: "medium",
      headline: "No private keys turned up in the code your app sends to the browser.",
      why: "Keys in frontend code are readable by every visitor, so finding none here is worth having.",
      nextStep:
        "Medium confidence, because modern apps split their code into pieces that only load on certain pages, and Snaglist only saw the ones your homepage loads. A key used only on an admin page would not show up here.",
      method: `${METHOD} ${scope}`,
    });
  },
};
