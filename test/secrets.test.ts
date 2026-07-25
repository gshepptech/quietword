import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { findPrivilegedJwts, findSecrets } from "@/lib/scanner/checks/secrets";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

const CLEAN = fixture("bundle-clean.js");
const LEAKY = fixture("bundle-leaky.js");

describe("findSecrets, on a bundle with real problems in it", () => {
  const findings = findSecrets(LEAKY);
  const kinds = findings.map((f) => f.kind);

  it("finds the Supabase service key", () => {
    expect(kinds).toContain("A Supabase service key");
  });

  it("finds the live Stripe secret key", () => {
    expect(kinds).toContain("A live Stripe secret key");
  });

  it("finds the AWS access key", () => {
    expect(kinds).toContain("An AWS access key");
  });

  it("finds the GitHub token", () => {
    expect(kinds).toContain("A GitHub token");
  });

  it("finds the database connection string", () => {
    expect(kinds).toContain("A database connection string with a password in it");
  });

  it("finds the Resend key", () => {
    expect(kinds).toContain("A Resend API key");
  });

  it("never puts the actual secret in the finding", () => {
    for (const finding of findings) {
      expect(finding.sample).toContain("...");
      expect(finding.sample.length).toBeLessThan(40);
    }
    const serialised = JSON.stringify(findings);
    expect(serialised).not.toContain("hunter2correct");
    expect(serialised).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});

/**
 * The more important half. Keys that are meant to be in the browser must never
 * be reported, because a false alarm teaches this user to ignore the next
 * result, and the next one might be real.
 */
describe("findSecrets, on a bundle that is fine", () => {
  it("reports nothing at all", () => {
    expect(findSecrets(CLEAN)).toEqual([]);
  });

  it("leaves the Supabase anon key alone", () => {
    expect(findPrivilegedJwts(CLEAN)).toEqual([]);
  });

  it.each([
    ["a Stripe publishable key", 'Stripe("pk_live_51NxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxYY")'],
    ["a Firebase browser key", 'apiKey: "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'],
    ["a PostHog key", 'key: "phc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'],
    ["a Sentry DSN", 'dsn: "https://0123456789abcdef@o1.ingest.sentry.io/1"'],
    ["a Stripe test key in a comment", "// use sk_test_ keys locally"],
  ])("leaves %s alone", (_name, snippet) => {
    expect(findSecrets(snippet)).toEqual([]);
  });
});

describe("findPrivilegedJwts", () => {
  it("reads the role claim rather than guessing from the shape", () => {
    const findings = findPrivilegedJwts(LEAKY);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("A Supabase service key");
  });

  it("ignores a token whose payload is not JSON", () => {
    expect(findPrivilegedJwts("eyJhbGciOiJIUzI1NiJ9.bm90LWpzb24tYXQtYWxs.c2ln")).toEqual([]);
  });
});

describe("findSecrets, deduplication", () => {
  it("reports one finding when the same key appears twice", () => {
    const text = 'const a = "AKIAIOSFODNN7EXAMPLE"; const b = "AKIAIOSFODNN7EXAMPLE";';
    expect(findSecrets(text)).toHaveLength(1);
  });

  it("does not report an Anthropic key twice under two names", () => {
    const text = 'key: "sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"';
    const findings = findSecrets(text);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("An Anthropic API key");
  });
});
