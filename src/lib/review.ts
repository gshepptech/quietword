/** Where the manual review link points, shared by the landing page and the report. */
export const REVIEW_CONTACT =
  process.env.NEXT_PUBLIC_REVIEW_CONTACT ?? "mailto:hello@example.com";

/**
 * Printed as given. The default is in US dollars, where most of the audience
 * is, even though the rest of the copy is British English.
 */
export const REVIEW_PRICE = process.env.NEXT_PUBLIC_REVIEW_PRICE ?? "$180";
