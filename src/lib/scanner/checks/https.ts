import type { ScanContext } from "../context";
import type { CheckResult, Evidence } from "../types";
import type { Confidence, Verdict } from "../types";
import { type Check, notChecked, result } from "./shared";

export interface HttpsEvidence {
  httpsReachable: boolean;
  httpsError: string | null;
  /** Status of the plain http request, or null when nothing answered. */
  httpStatus: number | null;
  httpLocation: string | null;
  /** True when the insecure port refused the connection outright. */
  httpUnreachable: boolean;
  hsts: string | null;
}

export type HttpsState =
  | "no_https"
  | "plain_http"
  | "redirect_to_https"
  | "no_insecure_port"
  | "unknown";

export interface HttpsAssessment {
  state: HttpsState;
  verdict: Verdict;
  confidence: Confidence;
  hstsMaxAge: number | null;
}

/**
 * What the insecure address actually did, in one sentence.
 *
 * "Served the page" is only true of a 2xx. An app behind a login gate answers
 * the insecure address with a 401, which is still a finding, because the
 * request reached the server over an open connection rather than being turned
 * back at the door. Describing that as serving the page is a detail a reader
 * can check and find wrong, on the one line of the report that exists to be
 * checked.
 */
export function describeInsecureAnswer(status: number, location: string | null): string {
  if (location) {
    return `Answered with ${status} and pointed at ${location} instead of sending the visitor to the secure address.`;
  }
  if (status < 300) {
    return `Answered with ${status} and served the page instead of sending the visitor to the secure address.`;
  }
  return `Answered with ${status} on the insecure address instead of sending the visitor to the secure one.`;
}

export function parseHstsMaxAge(header: string | null): number | null {
  if (!header) return null;
  const match = /max-age\s*=\s*"?(\d+)"?/i.exec(header);
  if (!match) return null;
  return Number(match[1]);
}

/**
 * The one check that is fully answerable from outside, so it is treated that
 * way: high confidence in both directions, and no hedging.
 *
 * Nothing listening on the insecure port is a pass, not a failure. HTTPS
 * working with no HSTS header is also a pass, because the redirect is the thing
 * that protects the visitor and HSTS is the improvement on top.
 */
export function evaluateHttps(evidence: HttpsEvidence): HttpsAssessment {
  const hstsMaxAge = parseHstsMaxAge(evidence.hsts);

  if (!evidence.httpsReachable) {
    return { state: "no_https", verdict: "attention", confidence: "high", hstsMaxAge };
  }
  if (evidence.httpUnreachable) {
    return { state: "no_insecure_port", verdict: "pass", confidence: "high", hstsMaxAge };
  }
  if (evidence.httpStatus === null) {
    return { state: "unknown", verdict: "not_checked", confidence: "low", hstsMaxAge };
  }
  if (evidence.httpStatus >= 300 && evidence.httpStatus < 400) {
    const target = evidence.httpLocation ?? "";
    if (/^https:\/\//i.test(target) || (target.startsWith("/") && evidence.httpsReachable)) {
      return { state: "redirect_to_https", verdict: "pass", confidence: "high", hstsMaxAge };
    }
    return { state: "plain_http", verdict: "attention", confidence: "high", hstsMaxAge };
  }
  return { state: "plain_http", verdict: "attention", confidence: "high", hstsMaxAge };
}

const TITLE = "Whether your app forces a secure connection";

const METHOD =
  "Quietword loaded your app over a secure connection and then asked for the same address over an insecure one, without following any redirect, to see what the server does with it. It also read the header that tells browsers to refuse the insecure version in future.";

export const httpsCheck: Check = {
  id: "https",
  title: TITLE,
  async run(ctx: ScanContext): Promise<CheckResult> {
    const host = ctx.target.host;
    const port = ctx.target.port;
    const httpsUrl = `https://${port ? `${ctx.target.hostname}:${port}` : host}/`;
    const httpUrl = `http://${port ? `${ctx.target.hostname}:${port}` : ctx.target.hostname}/`;

    const secure = await ctx.visit(httpsUrl);
    const insecure = await ctx.visit(httpUrl, {
      followRedirects: false,
      skipBody: true,
      // A host that drops traffic on the insecure port is a pass, and waiting
      // the full timeout to learn that spends budget the other checks need.
      timeoutMs: 4000,
    });

    const evidence: HttpsEvidence = {
      httpsReachable: secure.ok,
      httpsError: secure.ok ? null : secure.message,
      httpStatus: insecure.ok ? insecure.status : null,
      httpLocation: insecure.ok ? (insecure.headers["location"] ?? null) : null,
      // Refused or dropped both mean a visitor typing http:// gets nothing,
      // which is not a security problem.
      httpUnreachable: !insecure.ok && (insecure.kind === "network" || insecure.kind === "timeout"),
      hsts: secure.ok ? (secure.headers["strict-transport-security"] ?? null) : null,
    };

    // Runs first in the scan. If the user pasted an http address and the secure
    // version works, the rest of the checks should look at the secure one.
    if (secure.ok && ctx.origin.startsWith("http://")) {
      ctx.origin = new URL(httpsUrl).origin;
    }

    const assessment = evaluateHttps(evidence);
    const hstsNote: Evidence[] =
      assessment.hstsMaxAge === null
        ? []
        : [
            {
              label: "Strict-Transport-Security",
              detail: `Set, so browsers will refuse the insecure version of your site for the next ${Math.round(assessment.hstsMaxAge / 86400)} days.`,
            },
          ];

    switch (assessment.state) {
      case "no_https":
        return result("https", TITLE, {
          verdict: "attention",
          confidence: "high",
          headline: "Your app did not answer over a secure connection.",
          why: "Without HTTPS, everything between your visitors and your app travels in the open, including passwords they type and the session cookie that keeps them signed in. Anyone on the same network can read it.",
          nextStep:
            "Turn on HTTPS at your host. Vercel, Netlify, Railway, Render, and Cloudflare all issue a certificate for free and switch it on in one step.",
          method: METHOD,
          evidence: [
            { label: httpsUrl, detail: evidence.httpsError ?? "No answer over a secure connection." },
          ],
        });

      case "plain_http":
        return result("https", TITLE, {
          verdict: "attention",
          confidence: "high",
          headline: "Your app answers over an insecure connection instead of sending visitors to the secure one.",
          why: "A visitor who types your address without https, or follows an old link, stays on the insecure version. Their password and session cookie travel in the open, and anyone on the same network can read them.",
          nextStep:
            "Turn on the setting that redirects http to https. Most hosts call it force HTTPS or always use HTTPS and it is a single switch. Once it is on, add a Strict-Transport-Security header so browsers stop trying the insecure version.",
          method: METHOD,
          evidence: [
            {
              label: httpUrl,
              detail: describeInsecureAnswer(evidence.httpStatus ?? 0, evidence.httpLocation),
            },
            ...hstsNote,
          ],
        });

      case "redirect_to_https":
        return result("https", TITLE, {
          verdict: "pass",
          confidence: "high",
          headline: "Anyone arriving over an insecure connection gets sent to the secure one.",
          why: "This is what keeps passwords and session cookies from travelling in the open.",
          nextStep:
            assessment.hstsMaxAge === null
              ? "Nothing has to change. If you want the stronger version, add a Strict-Transport-Security header so browsers stop trying the insecure address at all."
              : "Nothing to do here.",
          method: METHOD,
          evidence: [
            {
              label: httpUrl,
              detail: `Answered with ${evidence.httpStatus} and sent the visitor to ${evidence.httpLocation ?? "the secure address"}.`,
            },
            ...hstsNote,
          ],
        });

      case "no_insecure_port":
        return result("https", TITLE, {
          verdict: "pass",
          confidence: "high",
          headline: "Your app only answers over a secure connection.",
          why: "There is no insecure version for a visitor to land on, which is the strongest version of this.",
          nextStep: "Nothing to do here.",
          method: METHOD,
          evidence: [
            { label: httpUrl, detail: "Nothing answered on the insecure port." },
            ...hstsNote,
          ],
        });

      default:
        return notChecked("https", TITLE, {
          headline: "Quietword could not tell what your app does with insecure connections.",
          why: "The secure version answered, but the insecure request did not come back with anything to judge.",
          nextStep: "Run the scan again in a few minutes.",
          method: METHOD,
        });
    }
  },
};
