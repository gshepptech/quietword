import { describe, expect, it } from "vitest";

import { detectLimiter, type ObservedResponse } from "@/lib/scanner/checks/rate-limit";

const answered = (status: number, headers: Record<string, string> = {}): ObservedResponse => ({
  status,
  headers,
});

describe("detectLimiter", () => {
  it("sees a limiter that turns requests away", () => {
    const evidence = detectLimiter([
      answered(401),
      answered(401),
      answered(429, { "retry-after": "60" }),
    ]);
    expect(evidence.limited).toBe(true);
    expect(evidence.reasons.join(" ")).toContain("turned away");
  });

  it("sees a limiter that only announces itself in headers", () => {
    const evidence = detectLimiter([
      answered(401, { "x-ratelimit-limit": "20", "x-ratelimit-remaining": "19" }),
      answered(401, { "x-ratelimit-limit": "20", "x-ratelimit-remaining": "18" }),
    ]);
    expect(evidence.limited).toBe(true);
    expect(evidence.reasons.join(" ")).toContain("headers");
  });

  it("reads the standard RateLimit headers as well as the x- prefixed ones", () => {
    expect(detectLimiter([answered(200, { "ratelimit-remaining": "4" })]).limited).toBe(true);
  });

  it("reports no limiter when ten attempts all get answered the same way", () => {
    const responses = Array.from({ length: 10 }, () => answered(401));
    const evidence = detectLimiter(responses);
    expect(evidence.limited).toBe(false);
    expect(evidence.reasons).toEqual([]);
  });

  it("does not read an unrelated header as a rate limit", () => {
    expect(detectLimiter([answered(200, { "x-request-id": "abc", server: "nginx" })]).limited).toBe(
      false,
    );
  });

  it("counts how many requests were turned away", () => {
    const evidence = detectLimiter([answered(401), answered(429), answered(429)]);
    expect(evidence.reasons[0]).toContain("2 of 3");
  });
});
