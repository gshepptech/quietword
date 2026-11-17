import path from "node:path";

import type { NextConfig } from "next";

import { reviewContact } from "./src/lib/review";

// Every page links to the manual review. Without the link, build, dev and start
// all stop here instead of serving a page that links nowhere.
reviewContact(process.env.NEXT_PUBLIC_REVIEW_CONTACT);

const config: NextConfig = {
  // Pin tracing to this project. Without it Next walks up and finds a lockfile
  // in the parent directory and guesses the wrong root.
  outputFileTracingRoot: path.join(__dirname),
  // undici keeps its own native-ish internals and must not be bundled by the
  // server compiler, or the custom connect-time lookup gets rewritten away.
  serverExternalPackages: ["undici"],
  poweredByHeader: false,

  /**
   * The scan checks whether other people's apps enforce HTTPS and leak
   * internals. Arriving with none of these set is the sort of thing this
   * product's own customers are learning to look for.
   *
   * The content security policy is not here. It needs a nonce that changes per
   * request, so it is set in src/middleware.ts. These are the headers whose
   * value is the same every time.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "strict-transport-security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "x-content-type-options", value: "nosniff" },
          { key: "referrer-policy", value: "strict-origin-when-cross-origin" },
          { key: "x-frame-options", value: "DENY" },
          { key: "cross-origin-opener-policy", value: "same-origin" },
          { key: "cross-origin-resource-policy", value: "same-origin" },
          // Nothing here needs a device. Refusing them up front means a future
          // dependency cannot quietly start asking.
          {
            key: "permissions-policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default config;
