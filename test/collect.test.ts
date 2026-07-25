import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { extractApiPaths, extractInlineScripts, extractScriptSources } from "@/lib/scanner/collect";

const PAGE = readFileSync(fileURLToPath(new URL("./fixtures/index-page.html", import.meta.url)), "utf8");

describe("extractScriptSources", () => {
  it("reads double quoted, single quoted, and bare src attributes", () => {
    expect(extractScriptSources(PAGE)).toEqual([
      "/assets/index-a1b2c3.js",
      "/assets/vendor-d4e5f6.js",
      "https://cdn.example.net/analytics.js",
    ]);
  });

  it("ignores a stylesheet link", () => {
    expect(extractScriptSources(PAGE)).not.toContain("/assets/index-a1b2c3.css");
  });

  it("returns nothing for a page with no scripts", () => {
    expect(extractScriptSources("<html><body><p>hello</p></body></html>")).toEqual([]);
  });
});

describe("extractInlineScripts", () => {
  it("returns the body of an inline script", () => {
    const inline = extractInlineScripts(PAGE);
    expect(inline).toHaveLength(1);
    expect(inline[0]).toContain("window.__CONFIG__");
  });
});

describe("extractApiPaths", () => {
  it("finds the routes the frontend calls", () => {
    expect(extractApiPaths(PAGE)).toEqual(["/api/me", "/api/v1", "/api/waitlist"]);
  });

  it("strips a trailing slash left by string concatenation", () => {
    expect(extractApiPaths('fetch("/api/users/" + id)')).toEqual(["/api/users"]);
  });

  it("ignores the bare api prefix", () => {
    expect(extractApiPaths('const base = "/api/"')).toEqual([]);
  });

  it("does not return duplicates", () => {
    expect(extractApiPaths('fetch("/api/todos"); fetch("/api/todos")')).toEqual(["/api/todos"]);
  });

  it("ignores paths nested too deep to be a collection route", () => {
    expect(extractApiPaths('"/api/a/b/c/d/e/f"')).toEqual([]);
  });
});
