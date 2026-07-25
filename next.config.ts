import path from "node:path";

import type { NextConfig } from "next";

const config: NextConfig = {
  // Pin tracing to this project. Without it Next walks up and finds a lockfile
  // in the parent directory and guesses the wrong root.
  outputFileTracingRoot: path.join(__dirname),
  // undici keeps its own native-ish internals and must not be bundled by the
  // server compiler, or the custom connect-time lookup gets rewritten away.
  serverExternalPackages: ["undici"],
  poweredByHeader: false,
};

export default config;
