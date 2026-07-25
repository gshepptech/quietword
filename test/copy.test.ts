import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The writing rules are part of the product, not a style preference, so they get
 * a test. Every user-facing string in the app lives under src, and a banned word
 * that reaches a report is a defect the same way a wrong verdict is.
 */

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx|css)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walk(SRC).map((path) => ({ path, text: readFileSync(path, "utf8") }));

const BANNED_WORDS = [
  "unlock",
  "elevate",
  "leverage",
  "seamless",
  "robust",
  "cutting-edge",
  "revolutionize",
  "revolutionise",
  "empower",
  "supercharge",
  "game-changing",
  "effortless",
  "next-level",
];

const BANNED_PHRASES = [
  "in today's fast-paced world",
  "in an era where",
  "get started today",
  "whether you're a",
  "whether you are a",
  "it's not just",
];

describe("writing rules", () => {
  it("finds source files to check", () => {
    expect(FILES.length).toBeGreaterThan(8);
  });

  it.each(BANNED_WORDS)("never uses the word %s", (word) => {
    const offenders = FILES.filter((file) => file.text.toLowerCase().includes(word)).map(
      (file) => file.path,
    );
    expect(offenders).toEqual([]);
  });

  it.each(BANNED_PHRASES)("never uses the phrase %s", (phrase) => {
    const offenders = FILES.filter((file) => file.text.toLowerCase().includes(phrase)).map(
      (file) => file.path,
    );
    expect(offenders).toEqual([]);
  });

  it("contains no em dashes anywhere", () => {
    const offenders = FILES.filter((file) => file.text.includes("—")).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("keeps the tone away from alarm words", () => {
    const alarming = /\b(critical|urgent|danger|breach|hacked|catastrophic)\b/i;
    const offenders = FILES.filter((file) => alarming.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it("never tells a user their app is secure", () => {
    const overclaim = /(your app is secure|fully secure|you'?re greenlit|you are greenlit|100% secure)/i;
    const offenders = FILES.filter((file) => overclaim.test(file.text)).map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
