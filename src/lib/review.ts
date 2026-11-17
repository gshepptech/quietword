/**
 * Checks the manual review link. Next.js inlines NEXT_PUBLIC_ values at build
 * time, so a missing one would ship the landing page and every report with a
 * link to nowhere.
 */
export function reviewContact(value: string | undefined): string {
  const contact = value?.trim();
  if (!contact) {
    throw new Error(
      "NEXT_PUBLIC_REVIEW_CONTACT is not set. Set it to a mailto: address or a booking URL (see .env.example).",
    );
  }
  let protocol: string;
  try {
    protocol = new URL(contact).protocol;
  } catch {
    protocol = "";
  }
  if (!["mailto:", "https:", "http:"].includes(protocol)) {
    throw new Error(
      `NEXT_PUBLIC_REVIEW_CONTACT must be a mailto: address or an http(s) booking URL, not "${contact}".`,
    );
  }
  return contact;
}

/** Where the manual review link points, shared by the landing page and the report. */
export const REVIEW_CONTACT = reviewContact(process.env.NEXT_PUBLIC_REVIEW_CONTACT);

/**
 * Printed as given. The default is in US dollars, where most of the audience
 * is, even though the rest of the copy is British English.
 */
export const REVIEW_PRICE = process.env.NEXT_PUBLIC_REVIEW_PRICE ?? "$180";
