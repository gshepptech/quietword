/**
 * The manual review is the product. The free scan is how people find it, so the
 * contact route lives in one place and both the landing page and the report use it.
 */
export const REVIEW_CONTACT =
  process.env.NEXT_PUBLIC_REVIEW_CONTACT ?? "mailto:hello@example.com";

export const REVIEW_PRICE = process.env.NEXT_PUBLIC_REVIEW_PRICE ?? "£150";
