import { describe, expect, it } from "vitest";

import { reviewContact } from "@/lib/review";

describe("reviewContact", () => {
  it.each([undefined, "", "   "])("refuses a missing value (%j)", (value) => {
    expect(() => reviewContact(value)).toThrow(/NEXT_PUBLIC_REVIEW_CONTACT is not set/);
  });

  it.each(["hello@example.com", "javascript:alert(1)", "ftp://example.com/book"])(
    "refuses %s, which is not a mailto: or http(s) link",
    (value) => {
      expect(() => reviewContact(value)).toThrow(/must be a mailto: address or an http\(s\) booking URL/);
    },
  );

  it.each(["mailto:review@example.com", "https://cal.example.com/review", " https://cal.example.com/review "])(
    "accepts %j",
    (value) => {
      expect(reviewContact(value)).toBe(value.trim());
    },
  );
});
