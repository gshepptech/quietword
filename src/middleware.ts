import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * The script policy has to be set here rather than in next.config.ts, because
 * it needs a value that changes per request.
 *
 * Next.js puts its own bootstrap in inline <script> tags. A static
 * `script-src 'self'` blocks them, the page never hydrates, and the form does
 * not render at all. The usual shortcut is to add 'unsafe-inline', which turns
 * the policy off for scripts and would be a poor look on a product that checks
 * other people's apps for exactly this class of mistake.
 *
 * So: a fresh nonce per request. Next reads it out of the CSP header we set
 * here and stamps it on the scripts it emits. 'strict-dynamic' then lets those
 * scripts load the chunks they need without listing every URL.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Next inlines the first-paint CSS. Styles cannot execute, so the risk
    // here is presentational rather than script execution.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    // The only request this page makes is to its own /api/scan.
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  // Next reads the nonce out of the policy on the *request* headers, and that
  // is how it knows what to stamp on the script tags it emits. Setting it only
  // on the response leaves those tags unnonced, and every chunk is then refused
  // by the policy the browser did receive.
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  // Everything except Next's own static output, which is served with its own
  // headers and does not execute in the page's context.
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
