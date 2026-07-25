import { describe, expect, it } from "vitest";

import { normaliseTarget, sameOriginUrl } from "@/lib/scanner/url";

describe("normaliseTarget", () => {
  it("assumes https when no scheme is given", () => {
    const result = normaliseTarget("myapp.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.origin).toBe("https://myapp.com");
  });

  it("keeps a port", () => {
    const result = normaliseTarget("myapp.com:8443");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.origin).toBe("https://myapp.com:8443");
  });

  it("keeps an http address the user typed on purpose", () => {
    const result = normaliseTarget("http://myapp.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url.protocol).toBe("http:");
  });

  it("drops the query string and fragment", () => {
    const result = normaliseTarget("https://myapp.com/dashboard?token=abc#top");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url.search).toBe("");
      expect(result.url.hash).toBe("");
    }
  });

  it("refuses an empty address", () => {
    expect(normaliseTarget("   ").ok).toBe(false);
  });

  it("refuses a scheme it does not scan", () => {
    const result = normaliseTarget("ftp://myapp.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("http");
  });

  it("refuses credentials in the address", () => {
    const result = normaliseTarget("https://user:secret@myapp.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("password");
  });

  // The guardrails, from the user's side of the form.
  it.each([
    "localhost:3000",
    "127.0.0.1:8080",
    "http://192.168.1.10",
    "10.0.0.5",
    "169.254.169.254",
    "http://[::1]:3000",
    "db.internal",
    "printer.local",
    "intranet",
  ])("refuses %s", (input) => {
    const result = normaliseTarget(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("public internet");
  });

  it("refuses an address with a space in it", () => {
    expect(normaliseTarget("my app.com").ok).toBe(false);
  });
});

describe("sameOriginUrl", () => {
  it("resolves a relative path", () => {
    expect(sameOriginUrl("https://myapp.com", "/assets/index.js")).toBe(
      "https://myapp.com/assets/index.js",
    );
  });

  it("ignores a third party script", () => {
    expect(sameOriginUrl("https://myapp.com", "https://cdn.example.net/a.js")).toBeNull();
  });

  it("ignores a data url", () => {
    expect(sameOriginUrl("https://myapp.com", "data:text/javascript,alert(1)")).toBeNull();
  });
});
