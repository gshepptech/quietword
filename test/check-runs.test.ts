import type { Agent } from "undici";
import { describe, expect, it } from "vitest";

import { authCheck } from "@/lib/scanner/checks/auth";
import { errorsCheck } from "@/lib/scanner/checks/errors";
import { rateLimitCheck } from "@/lib/scanner/checks/rate-limit";
import { secretsCheck } from "@/lib/scanner/checks/secrets";
import type { ScanContext } from "@/lib/scanner/context";
import { runScan, TargetUnreachableError } from "@/lib/scanner";
import { ScanBudget, type Probe, type ProbeResponse } from "@/lib/scanner/net";

/**
 * These drive each check's real `run` against a stubbed set of responses. The
 * pure analysis functions are tested elsewhere; what is under test here is the
 * decision each check makes about the verdict, which is where a false pass
 * would come from.
 */

interface Reply {
  status: number;
  body?: string;
  contentType?: string;
  headers?: Record<string, string>;
}

const ORIGIN = "https://testapp.example";

function answer(url: string, reply: Reply): ProbeResponse {
  return {
    ok: true,
    url,
    requestedUrl: url,
    status: reply.status,
    headers: {
      "content-type": reply.contentType ?? "application/json",
      ...reply.headers,
    },
    body: reply.body ?? "",
    bodyTruncated: false,
    chain: [url],
  };
}

function fakeContext(
  routes: Record<string, Reply>,
  fallback: Reply = { status: 404, body: '{"error":"Not found"}' },
  collected: Partial<ScanContext["collected"]> = {},
): ScanContext {
  const captured: ProbeResponse[] = [];
  const ctx: ScanContext = {
    target: new URL(ORIGIN),
    origin: ORIGIN,
    budget: new ScanBudget(),
    dispatcher: {} as Agent,
    captured,
    failures: [],
    collected: { page: null, pageError: null, scripts: [], bundleText: "", apiPaths: [], ...collected },
    async visit(url: string): Promise<Probe> {
      ctx.budget.spendRequest();
      const path = new URL(url).pathname;
      const response = answer(url, routes[path] ?? fallback);
      captured.push(response);
      return response;
    },
  };
  return ctx;
}

const USERS = JSON.stringify([
  { id: 1, email: "dana@customer.co", name: "Dana", stripe_customer_id: "cus_abc" },
  { id: 2, email: "sam@customer.co", name: "Sam", stripe_customer_id: "cus_def" },
]);

describe("authCheck", () => {
  it("reports an open route that hands back personal information", async () => {
    const ctx = fakeContext({ "/api/users": { status: 200, body: USERS } });
    const check = await authCheck.run(ctx);

    expect(check.verdict).toBe("attention");
    expect(check.confidence).toBe("high");
    expect(check.evidence.map((e) => e.label)).toContain("/api/users");
    expect(check.evidence[0]?.detail).toContain("email");
  });

  it("passes when every route it found asks for a login", async () => {
    const ctx = fakeContext(
      {
        "/api/orders": { status: 401, body: '{"error":"unauthorised"}' },
        "/api/me": { status: 403, body: '{"error":"forbidden"}' },
      },
      { status: 404 },
      { apiPaths: ["/api/orders", "/api/me"] },
    );
    const check = await authCheck.run(ctx);

    expect(check.verdict).toBe("pass");
    expect(check.confidence).toBe("medium");
  });

  it("does not report a public route that holds nothing personal", async () => {
    const ctx = fakeContext(
      { "/api/posts": { status: 200, body: JSON.stringify([{ id: 1, title: "Hello", body: "Hi" }]) } },
      { status: 404 },
      { apiPaths: ["/api/posts"] },
    );
    const check = await authCheck.run(ctx);
    expect(check.verdict).toBe("pass");
    expect(check.evidence.map((e) => e.label)).toContain("/api/posts");
  });

  it("says not checked, never pass, when no route answers", async () => {
    const check = await authCheck.run(fakeContext({}));
    expect(check.verdict).toBe("not_checked");
    expect(check.headline).toContain("could not find any API routes");
  });

  /** A single page app answers every unknown path with its HTML shell. */
  it("is not fooled by a single page app answering everything with 200", async () => {
    const ctx = fakeContext(
      {},
      { status: 200, contentType: "text/html", body: "<!doctype html><div id=root></div>" },
    );
    const check = await authCheck.run(ctx);
    expect(check.verdict).toBe("not_checked");
  });
});

describe("rateLimitCheck", () => {
  it("passes when the endpoint starts turning requests away", async () => {
    let seen = 0;
    const ctx = fakeContext({ "/api/auth/login": { status: 401 } });
    const original = ctx.visit.bind(ctx);
    ctx.visit = async (url, options) => {
      seen += 1;
      if (seen > 4 && new URL(url).pathname === "/api/auth/login") {
        return answer(url, { status: 429, headers: { "retry-after": "60" } });
      }
      return original(url, options);
    };

    const check = await rateLimitCheck.run(ctx);
    expect(check.verdict).toBe("pass");
    expect(check.confidence).toBe("high");
  });

  it("passes on rate limit headers alone", async () => {
    const ctx = fakeContext({
      "/api/auth/login": { status: 401, headers: { "ratelimit-remaining": "3" } },
    });
    const check = await rateLimitCheck.run(ctx);
    expect(check.verdict).toBe("pass");
  });

  it("reports no limiter at medium confidence, and says why", async () => {
    const ctx = fakeContext({ "/api/auth/login": { status: 401 } });
    const check = await rateLimitCheck.run(ctx);

    expect(check.verdict).toBe("attention");
    expect(check.confidence).toBe("medium");
    expect(JSON.stringify(check.evidence)).toContain("would not show up in a test this small");
  });

  it("stops at ten requests", async () => {
    const ctx = fakeContext({ "/api/auth/login": { status: 401 } });
    await rateLimitCheck.run(ctx);
    expect(ctx.budget.requestsUsed).toBeLessThanOrEqual(10);
  });

  it("says not checked when there is no sign-in endpoint", async () => {
    const check = await rateLimitCheck.run(fakeContext({}));
    expect(check.verdict).toBe("not_checked");
  });
});

describe("errorsCheck", () => {
  it("reports a stack trace that came back from a broken request", async () => {
    const ctx = fakeContext(
      {},
      {
        status: 500,
        body: 'TypeError: undefined\n    at handler (/var/www/app/routes/index.js:12:9)\n    at run (/var/www/app/server.js:4:1)',
        contentType: "text/plain",
      },
    );
    const check = await errorsCheck.run(ctx);

    expect(check.verdict).toBe("attention");
    expect(check.confidence).toBe("high");
    expect(check.evidence[0]?.detail).toContain("stack trace");
  });

  it("passes on a tidy 404", async () => {
    const check = await errorsCheck.run(fakeContext({}));
    expect(check.verdict).toBe("pass");
    expect(check.confidence).toBe("medium");
  });
});

describe("secretsCheck", () => {
  it("says not checked when the page could not be read", async () => {
    const ctx = fakeContext({}, { status: 404 }, { pageError: "that hostname does not resolve" });
    const check = await secretsCheck.run(ctx);

    expect(check.verdict).toBe("not_checked");
    expect(check.nextStep).toContain("that hostname does not resolve");
  });

  it("reports a service key found in the bundle", async () => {
    const bundle =
      'createClient("https://x.supabase.co","eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3BxcnN0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MDAwMDAwMCwiZXhwIjoyMDUwMDAwMDAwfQ.ZmFrZS1zaWduYXR1cmUtZm9yLXRlc3RzLW9ubHktbm90LXJlYWw")';
    const page = answer(`${ORIGIN}/`, { status: 200, contentType: "text/html", body: "<html></html>" });
    const ctx = fakeContext(
      {},
      { status: 404 },
      { page, bundleText: bundle, scripts: [{ url: `${ORIGIN}/a.js`, body: bundle, truncated: false }] },
    );

    const check = await secretsCheck.run(ctx);
    expect(check.verdict).toBe("attention");
    expect(check.evidence[0]?.label).toBe("A Supabase service key");
  });
});

describe("runScan", () => {
  it("refuses a target on a private network before any check reports a pass", async () => {
    await expect(runScan(new URL("http://10.0.0.1/"))).rejects.toBeInstanceOf(TargetUnreachableError);
  });
});
