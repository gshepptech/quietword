import { beforeEach, describe, expect, it } from "vitest";

import {
  beginScan,
  endScan,
  MAX_CONCURRENT,
  MAX_PER_WINDOW,
  releaseScanSlot,
  resetLimiter,
  takeScanSlot,
  WINDOW_MS,
} from "@/lib/ratelimit";

beforeEach(() => {
  resetLimiter();
});

describe("takeScanSlot", () => {
  it("allows up to the window limit and then refuses", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) {
      expect(takeScanSlot("1.2.3.4", now).allowed).toBe(true);
    }
    const refused = takeScanSlot("1.2.3.4", now);
    expect(refused.allowed).toBe(false);
    expect(refused.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("counts each caller separately", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) takeScanSlot("1.2.3.4", now);
    expect(takeScanSlot("5.6.7.8", now).allowed).toBe(true);
  });

  it("lets the caller back in once the window has passed", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) takeScanSlot("1.2.3.4", now);
    expect(takeScanSlot("1.2.3.4", now + WINDOW_MS + 1).allowed).toBe(true);
  });

  it("gives back a slot when the scan never ran", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_PER_WINDOW; i += 1) takeScanSlot("1.2.3.4", now);
    releaseScanSlot("1.2.3.4");
    expect(takeScanSlot("1.2.3.4", now).allowed).toBe(true);
  });
});

describe("concurrency cap", () => {
  it("refuses once the cap is reached and recovers as scans finish", () => {
    for (let i = 0; i < MAX_CONCURRENT; i += 1) expect(beginScan()).toBe(true);
    expect(beginScan()).toBe(false);
    endScan();
    expect(beginScan()).toBe(true);
  });
});
