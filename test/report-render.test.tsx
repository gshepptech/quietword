import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Report } from "@/components/report";
import type { CheckResult, ScanReport } from "@/lib/scanner/types";

function check(overrides: Partial<CheckResult>): CheckResult {
  return {
    id: "secrets",
    title: "Keys and passwords in your app's code",
    verdict: "pass",
    confidence: "medium",
    headline: "Nothing turned up.",
    why: "Because it matters.",
    nextStep: "Do this next.",
    method: "Quietword read the page.",
    evidence: [],
    ...overrides,
  };
}

function report(checks: CheckResult[]): ScanReport {
  return {
    target: "https://testapp.example",
    active: false,
    startedAt: new Date().toISOString(),
    durationMs: 4200,
    checks,
    summary: {
      attention: checks.filter((c) => c.verdict === "attention").length,
      passed: checks.filter((c) => c.verdict === "pass").length,
      notChecked: checks.filter((c) => c.verdict === "not_checked").length,
    },
    budget: { requestsUsed: 18, requestLimit: 40, ranOut: false },
  };
}

describe("Report", () => {
  it("puts the verdict in words, not only in colour", () => {
    const html = renderToStaticMarkup(
      <Report
        report={report([
          check({ id: "secrets", verdict: "attention" }),
          check({ id: "auth", verdict: "pass" }),
          check({ id: "https", verdict: "not_checked" }),
        ])}
      />,
    );

    expect(html).toContain("Worth fixing");
    expect(html).toContain("Looks fine");
    expect(html).toContain("Not checked");
  });

  it("always says five checks is not an audit", () => {
    const html = renderToStaticMarkup(<Report report={report([check({})])} />);
    expect(html).toContain("not a security audit");
  });

  it("summarises a clean scan without claiming the app is secure", () => {
    const html = renderToStaticMarkup(
      <Report report={report([check({ id: "secrets" }), check({ id: "auth" })])} />,
    );
    expect(html).toContain("came back clean");
    // The product never tells anyone their app is secure. These are the
    // phrases a clean scan is tempted to reach for.
    expect(html).not.toMatch(
      /is secure|fully secure|all clear|no snags|you'?re safe|you are safe|nothing to worry|good to go|passed the audit/i,
    );
  });

  it("counts what needs fixing without shouting about it", () => {
    const html = renderToStaticMarkup(
      <Report
        report={report([
          check({ id: "secrets", verdict: "attention" }),
          check({ id: "auth", verdict: "attention" }),
        ])}
      />,
    );
    expect(html).toContain("Two checks found something worth fixing");
    expect(html).not.toMatch(/critical|urgent|danger|vulnerable/i);
  });

  it("writes the counts as words so the heading reads as a sentence", () => {
    const html = renderToStaticMarkup(
      <Report
        report={report([
          check({ id: "secrets", verdict: "attention" }),
          check({ id: "auth", verdict: "not_checked" }),
          check({ id: "https", verdict: "not_checked" }),
        ])}
      />,
    );
    expect(html).toContain("One check found something worth fixing. Two could not be run at all.");
  });

  it("says when the scan ran out of room instead of hiding it", () => {
    const base = report([check({})]);
    const html = renderToStaticMarkup(
      <Report report={{ ...base, budget: { ...base.budget, ranOut: true } }} />,
    );
    expect(html).toContain("hit its own limit");
  });

  it("renders evidence rows", () => {
    const html = renderToStaticMarkup(
      <Report
        report={report([
          check({
            verdict: "attention",
            evidence: [{ label: "/api/customers", detail: "Returned 42 records." }],
          }),
        ])}
      />,
    );
    expect(html).toContain("/api/customers");
    expect(html).toContain("Returned 42 records.");
  });
});

/**
 * The writing rules are part of the product, so they get a test. A banned word
 * in a report is a defect the same way a wrong verdict is.
 */
describe("report copy", () => {
  const BANNED = [
    "unlock",
    "elevate",
    "leverage",
    "seamless",
    "robust",
    "cutting-edge",
    "revolutionize",
    "empower",
    "supercharge",
    "game-changing",
    "effortless",
    "next-level",
  ];

  const html = renderToStaticMarkup(
    <Report
      report={report([
        check({ id: "secrets", verdict: "attention" }),
        check({ id: "auth", verdict: "not_checked" }),
      ])}
    />,
  );

  it.each(BANNED)("does not use the word %s", (word) => {
    expect(html.toLowerCase()).not.toContain(word);
  });

  it("contains no em dashes", () => {
    expect(html).not.toContain("—");
  });
});
