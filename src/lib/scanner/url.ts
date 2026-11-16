import { blockedHostnameReason } from "./addresses";

export type NormalisedTarget =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

const MAX_INPUT = 2000;

/**
 * Turn whatever the user pasted into a URL worth scanning, or a sentence
 * explaining why it is not. The messages here are read by someone who is not
 * sure what a scheme is, so they say what to do rather than what went wrong.
 */
export function normaliseTarget(input: string): NormalisedTarget {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { ok: false, reason: "Paste the address of your live app to start." };
  }
  if (trimmed.length > MAX_INPUT) {
    return { ok: false, reason: "That address is too long to be a real one." };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, reason: "That address has a space in it. Check it and paste it again." };
  }

  const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: "That does not look like a web address. It should look like example.com." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Quietword only scans addresses starting with http or https." };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "Remove the username and password from the address before scanning." };
  }

  const hostReason = blockedHostnameReason(url.hostname);
  if (hostReason) {
    return {
      ok: false,
      reason: `Quietword only scans apps that are live on the public internet. That address points at ${hostReason}.`,
    };
  }

  // The scan works from the site root outward, so query strings and fragments
  // on the pasted URL are noise.
  url.hash = "";
  url.search = "";
  return { ok: true, url };
}

/** Resolve a path against the target origin, ignoring anything off-origin. */
export function sameOriginUrl(origin: string, candidate: string): string | null {
  try {
    const resolved = new URL(candidate, origin);
    if (resolved.origin !== new URL(origin).origin) return null;
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return null;
    return resolved.toString();
  } catch {
    return null;
  }
}
