import { describe, expect, it } from "vitest";

import { buildCsp } from "@/middleware";

const NONCE = "dGVzdC1ub25jZQ==";

function directive(csp: string, name: string): string {
  const found = csp.split("; ").find((part) => part.startsWith(`${name} `));
  if (!found) throw new Error(`no ${name} directive in: ${csp}`);
  return found;
}

describe("buildCsp in production", () => {
  const csp = buildCsp(NONCE, false);

  // The whole point of this product is telling people their app leaks. Shipping
  // a policy that permits eval would be the same mistake it charges to find.
  it("never permits unsafe-eval", () => {
    expect(csp).not.toContain("unsafe-eval");
  });

  it("never permits unsafe-inline for scripts", () => {
    expect(directive(csp, "script-src")).not.toContain("unsafe-inline");
  });

  it("carries the nonce and strict-dynamic so Next can hydrate", () => {
    expect(directive(csp, "script-src")).toContain(`'nonce-${NONCE}'`);
    expect(directive(csp, "script-src")).toContain("'strict-dynamic'");
  });

  it("holds connect-src to self, with no websocket opened up", () => {
    expect(directive(csp, "connect-src")).toBe("connect-src 'self'");
  });

  it("keeps the directives that stop the page being framed or rebased", () => {
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
  });
});

describe("buildCsp in development", () => {
  const csp = buildCsp(NONCE, true);

  // Without this, React Refresh throws an EvalError, the client bundle dies,
  // the page never hydrates, and the form silently does nothing.
  it("permits unsafe-eval so the page hydrates under next dev", () => {
    expect(directive(csp, "script-src")).toContain("'unsafe-eval'");
  });

  it("permits the hot reload websocket", () => {
    expect(directive(csp, "connect-src")).toContain("ws:");
  });

  it("still refuses unsafe-inline for scripts", () => {
    expect(directive(csp, "script-src")).not.toContain("unsafe-inline");
  });

  it("differs from production only in script-src and connect-src", () => {
    const prod = buildCsp(NONCE, false).split("; ");
    const dev = buildCsp(NONCE, true).split("; ");
    const changed = dev
      .filter((d, i) => d !== prod[i])
      .map((d) => d.split(" ")[0]);
    expect(changed).toEqual(["script-src", "connect-src"]);
  });
});
