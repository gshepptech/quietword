import { describe, expect, it } from "vitest";

import {
  describeInsecureAnswer,
  evaluateHttps,
  type HttpsEvidence,
  parseHstsMaxAge,
} from "@/lib/scanner/checks/https";

const base: HttpsEvidence = {
  httpsReachable: true,
  httpsError: null,
  httpStatus: null,
  httpLocation: null,
  httpUnreachable: false,
  hsts: null,
};

describe("evaluateHttps", () => {
  it("passes when the insecure address redirects to the secure one", () => {
    const assessment = evaluateHttps({
      ...base,
      httpStatus: 301,
      httpLocation: "https://myapp.com/",
    });
    expect(assessment).toMatchObject({ state: "redirect_to_https", verdict: "pass", confidence: "high" });
  });

  it("passes when the redirect target is a relative path", () => {
    const assessment = evaluateHttps({ ...base, httpStatus: 308, httpLocation: "/" });
    expect(assessment.verdict).toBe("pass");
  });

  it("passes when nothing is listening on the insecure port", () => {
    const assessment = evaluateHttps({ ...base, httpUnreachable: true });
    expect(assessment).toMatchObject({ state: "no_insecure_port", verdict: "pass" });
  });

  it("still passes when there is no HSTS header, because the redirect is the thing that protects people", () => {
    const assessment = evaluateHttps({
      ...base,
      httpStatus: 301,
      httpLocation: "https://myapp.com/",
      hsts: null,
    });
    expect(assessment.verdict).toBe("pass");
    expect(assessment.hstsMaxAge).toBeNull();
  });

  it("reports the insecure address serving the page instead of redirecting", () => {
    const assessment = evaluateHttps({ ...base, httpStatus: 200 });
    expect(assessment).toMatchObject({ state: "plain_http", verdict: "attention", confidence: "high" });
  });

  it("reports a redirect that stays on the insecure scheme", () => {
    const assessment = evaluateHttps({
      ...base,
      httpStatus: 302,
      httpLocation: "http://myapp.com/login",
    });
    expect(assessment.verdict).toBe("attention");
  });

  it("reports an app with no secure version at all", () => {
    const assessment = evaluateHttps({
      ...base,
      httpsReachable: false,
      httpsError: "the TLS handshake failed",
      httpStatus: 200,
    });
    expect(assessment).toMatchObject({ state: "no_https", verdict: "attention", confidence: "high" });
  });

  it("says not checked rather than passing when the insecure request gave nothing back", () => {
    const assessment = evaluateHttps({ ...base, httpStatus: null, httpUnreachable: false });
    expect(assessment.verdict).toBe("not_checked");
  });
});

describe("parseHstsMaxAge", () => {
  it("reads the max age", () => {
    expect(parseHstsMaxAge("max-age=31536000; includeSubDomains; preload")).toBe(31536000);
  });

  it("copes with spacing and quotes", () => {
    expect(parseHstsMaxAge('max-age = "600"')).toBe(600);
  });

  it("returns null when the header is missing or malformed", () => {
    expect(parseHstsMaxAge(null)).toBeNull();
    expect(parseHstsMaxAge("includeSubDomains")).toBeNull();
  });
});

/**
 * Found against a real app behind a login gate: the insecure address answered
 * 401 and the report described that as serving the page.
 */
describe("describeInsecureAnswer", () => {
  it("says the page was served only when the app actually served it", () => {
    expect(describeInsecureAnswer(200, null)).toContain("served the page");
  });

  it("does not claim a page was served when the answer was a 401", () => {
    const line = describeInsecureAnswer(401, null);
    expect(line).not.toContain("served the page");
    expect(line).toContain("401 on the insecure address");
  });

  it("names the address an insecure redirect pointed at", () => {
    expect(describeInsecureAnswer(302, "http://elsewhere.example/")).toContain(
      "pointed at http://elsewhere.example/",
    );
  });
});
