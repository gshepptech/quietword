import { describe, expect, it } from "vitest";

import { clientKey } from "@/lib/client-key";

const req = (headers: Record<string, string>): Request =>
  new Request("https://example.com/api/scan", { method: "POST", headers });

describe("clientKey", () => {
  it("ignores a client-supplied x-forwarded-for when no proxy is trusted", () => {
    // Trusting this header would let a caller choose their own rate-limit
    // bucket and reset it at will by changing the value.
    expect(clientKey(req({ "x-forwarded-for": "9.9.9.9" }))).toBe("untrusted");
    expect(clientKey(req({ "x-forwarded-for": "8.8.8.8" }))).toBe("untrusted");
  });

  it("gives every untrusted caller the same bucket, so the limit still bites", () => {
    const a = clientKey(req({ "x-forwarded-for": "1.1.1.1" }));
    const b = clientKey(req({ "x-forwarded-for": "2.2.2.2" }));
    expect(a).toBe(b);
  });

  it("prefers a platform header the client cannot spoof", () => {
    const key = clientKey(
      req({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "9.9.9.9" }),
    );
    expect(key).toBe("203.0.113.7");
  });

  it("accepts cloudflare and fly headers too", () => {
    expect(clientKey(req({ "cf-connecting-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientKey(req({ "fly-client-ip": "198.51.100.5" }))).toBe("198.51.100.5");
  });

  it("falls back to no identity rather than a spoofable one", () => {
    expect(clientKey(req({}))).toBe("untrusted");
    expect(clientKey(req({ "x-real-ip": "9.9.9.9" }))).toBe("untrusted");
  });
});
