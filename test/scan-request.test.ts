import { describe, expect, it } from "vitest";

import { readScanRequest } from "@/lib/scan-request";

describe("readScanRequest", () => {
  it("leaves active checks off when the caller does not ask for them", () => {
    expect(readScanRequest({ url: "myapp.com", consent: true })).toEqual({
      url: "myapp.com",
      consent: true,
      active: false,
    });
  });

  it("turns active checks on only for a literal true", () => {
    for (const active of ["true", 1, "yes", null]) {
      const parsed = readScanRequest({ url: "myapp.com", consent: true, active });
      expect(typeof parsed === "object" && parsed.active).toBe(false);
    }
    const parsed = readScanRequest({ url: "myapp.com", consent: true, active: true });
    expect(typeof parsed === "object" && parsed.active).toBe(true);
  });

  it("refuses a scan without the consent tick, active or not", () => {
    expect(readScanRequest({ url: "myapp.com", consent: false, active: true })).toContain(
      "Tick the box",
    );
  });
});
