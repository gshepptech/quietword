import { describe, expect, it } from "vitest";

import { assessPayload } from "@/lib/scanner/checks/auth";

const JSON_TYPE = "application/json; charset=utf-8";

describe("assessPayload, responses that are a finding", () => {
  it("flags a list of users with email addresses", () => {
    const body = JSON.stringify([
      { id: 1, email: "dana@realcustomer.co", name: "Dana" },
      { id: 2, email: "sam@another.co", name: "Sam" },
    ]);
    const assessment = assessPayload(body, JSON_TYPE);
    expect(assessment.isData).toBe(true);
    expect(assessment.recordCount).toBe(2);
    expect(assessment.signals.join(" ")).toContain("email");
  });

  it("looks inside a data wrapper", () => {
    const body = JSON.stringify({
      data: [{ id: "a", phone_number: "+441234567890", full_name: "Jo" }],
    });
    expect(assessPayload(body, JSON_TYPE).signals.length).toBeGreaterThan(0);
  });

  it("flags password hashes even with no email in sight", () => {
    const body = JSON.stringify([{ username: "jo", password_hash: "$2b$10$abcdefghijklmno" }]);
    expect(assessPayload(body, JSON_TYPE).signals.join(" ")).toContain("password_hash");
  });

  it("flags a single record rather than only lists", () => {
    const body = JSON.stringify({ id: 9, email: "dana@realcustomer.co", plan: "pro" });
    expect(assessPayload(body, JSON_TYPE).signals.length).toBeGreaterThan(0);
  });
});

describe("assessPayload, responses that are not a finding", () => {
  it("leaves a public list of products alone", () => {
    const body = JSON.stringify([
      { id: 1, title: "Small", price: 900 },
      { id: 2, title: "Large", price: 1900 },
    ]);
    const assessment = assessPayload(body, JSON_TYPE);
    expect(assessment.isData).toBe(true);
    expect(assessment.signals).toEqual([]);
  });

  it("leaves a health endpoint alone", () => {
    expect(assessPayload('{"status":"ok"}', JSON_TYPE).isData).toBe(false);
  });

  it("ignores placeholder email addresses in documentation-style responses", () => {
    const body = JSON.stringify({ message: "Contact support@example.com", code: "not_found" });
    expect(assessPayload(body, JSON_TYPE).signals).toEqual([]);
  });

  it("ignores an HTML page that happens to be served at an api path", () => {
    const body = "<!doctype html><html><body>Hello dana@realcustomer.co</body></html>";
    expect(assessPayload(body, "text/html").isData).toBe(false);
  });

  it("ignores a body that is not valid JSON", () => {
    expect(assessPayload("{ this is not json", JSON_TYPE).isData).toBe(false);
  });

  it("ignores an empty body", () => {
    expect(assessPayload("", JSON_TYPE).isData).toBe(false);
  });

  it("treats an empty list as nothing to report", () => {
    expect(assessPayload("[]", JSON_TYPE).isData).toBe(false);
  });
});
