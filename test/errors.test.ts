import { describe, expect, it } from "vitest";

import { findLeak, shouldInspect } from "@/lib/scanner/checks/errors";
import {
  BUNDLE_WITH_TRACE_PARSER,
  CLEAN_404,
  CLEAN_HTML_404,
  FLASK_DEBUG_PAGE,
  NODE_STACK,
  POSTGRES_ERROR,
  PRISMA_ERROR,
  PYTHON_TRACEBACK,
} from "./fixtures/errors";

describe("findLeak, output that should be reported", () => {
  it("finds a Node stack trace", () => {
    expect(findLeak(NODE_STACK)?.kind).toBe("a JavaScript stack trace");
  });

  it("finds a Python traceback", () => {
    expect(findLeak(PYTHON_TRACEBACK)?.kind).toBe("a Python traceback");
  });

  it("finds a Prisma error carrying the query", () => {
    expect(findLeak(PRISMA_ERROR)?.kind).toBe("an ORM error with your query in it");
  });

  it("finds a Postgres constraint error", () => {
    expect(findLeak(POSTGRES_ERROR)?.kind).toBe("a database error");
  });

  it("finds a framework debug page", () => {
    expect(findLeak(FLASK_DEBUG_PAGE)).not.toBeNull();
  });

  it("finds a leaked environment variable", () => {
    expect(findLeak("DATABASE_URL=postgres://app:pw@db.example:5432/main")?.kind).toContain(
      "environment variable",
    );
  });

  it("returns an excerpt short enough to put in a report", () => {
    const leak = findLeak(PYTHON_TRACEBACK);
    expect(leak).not.toBeNull();
    expect(leak!.excerpt.length).toBeLessThanOrEqual(243);
  });
});

describe("findLeak, output that should be left alone", () => {
  it("says nothing about a tidy JSON 404", () => {
    expect(findLeak(CLEAN_404)).toBeNull();
  });

  it("says nothing about a tidy HTML 404", () => {
    expect(findLeak(CLEAN_HTML_404)).toBeNull();
  });

  it("says nothing about an empty body", () => {
    expect(findLeak("")).toBeNull();
  });

  it("says nothing about an ordinary error message with no detail in it", () => {
    expect(findLeak('{"error":"Something went wrong. Please try again."}')).toBeNull();
  });
});

describe("shouldInspect", () => {
  it("reads error responses", () => {
    expect(shouldInspect(500, "text/html")).toBe(true);
    expect(shouldInspect(404, "application/json")).toBe(true);
  });

  it("reads JSON even when the status is fine", () => {
    expect(shouldInspect(200, "application/json")).toBe(true);
  });

  /**
   * A minified bundle contains other people's stack-trace parsing code. Reading
   * it would produce a finding on an app that is fine, so JavaScript assets are
   * never inspected at all.
   */
  it("never reads a JavaScript bundle", () => {
    expect(shouldInspect(200, "application/javascript")).toBe(false);
    expect(shouldInspect(500, "text/javascript")).toBe(false);
    expect(findLeak(BUNDLE_WITH_TRACE_PARSER)).toBeNull();
  });

  it("does not read a plain HTML page that came back fine", () => {
    expect(shouldInspect(200, "text/html")).toBe(false);
  });
});

describe("file paths versus URL paths", () => {
  it("does not call a script tag on an /app/ base path a leak", () => {
    // Vite with base: '/app/' emits exactly this on a correctly built app. It
    // is the owner's own script tag, not evidence of a leaked file path.
    const page = `<script type="module" crossorigin src="/app/assets/index-a1b2c3.js"></script><h1>404 Not Found</h1>`;
    expect(findLeak(page)).toBeNull();
  });

  it("leaves /srv/ and /workspace/ script tags alone too", () => {
    expect(findLeak(`<script src="/srv/static/main.js"></script>`)).toBeNull();
    expect(findLeak(`<link href="/workspace/dist/app.js">`)).toBeNull();
  });

  it("still catches an /app/ path in a real stack frame", () => {
    // Reported as a stack trace rather than a bare path, because the stack
    // pattern matches first and is the more accurate label. Either way it is
    // a finding, which is what matters.
    const trace = `TypeError: undefined is not a function\n    at handler (/app/dist/server.js:42:17)`;
    expect(findLeak(trace)).not.toBeNull();
  });

  it("catches an /app/ path with a line number outside a stack trace", () => {
    expect(findLeak(`Failed to compile (/app/src/routes/index.ts:12:4)`)?.kind).toBe(
      "a file path from your server",
    );
  });

  it("still catches a home directory path with no corroboration needed", () => {
    expect(findLeak(`Error loading /Users/dev/projects/api/src/index.ts`)?.kind).toBe(
      "a file path from your server",
    );
    expect(findLeak(`require failed: /home/runner/work/app/build/main.js`)?.kind).toBe(
      "a file path from your server",
    );
  });
});
