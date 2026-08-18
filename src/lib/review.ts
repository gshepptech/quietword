/**
 * The manual review is the product. The free scan is how people find it, so the
 * contact route lives in one place and both the landing page and the report use it.
 */
export const REVIEW_CONTACT =
  process.env.NEXT_PUBLIC_REVIEW_CONTACT ?? "mailto:hello@example.com";

/**
 * Priced in dollars because that is where the buyer is. The people this is for
 * ship with AI coding tools, and that market is mostly American. A pound price
 * makes them convert in their head at the moment they are deciding, and it says
 * "not local to you" on a product whose offer is that a person will read their
 * app and talk to them. The rest of the voice can stay British; the one string
 * attached to a transaction should not be.
 *
 * A round number on purpose. 180 reads as a price, and the arithmetic conversion
 * of some other currency reads as a conversion.
 */
export const REVIEW_PRICE = process.env.NEXT_PUBLIC_REVIEW_PRICE ?? "$180";
