import type { ScanContext } from "../context";
import type { CheckResult, Evidence } from "../types";
import { type Check, notChecked, pathOf, result, snippet } from "./shared";

export interface Leak {
  /** Plain-language name for what leaked. */
  kind: string;
  /** The matched text, trimmed for a report. */
  excerpt: string;
}

interface Marker {
  kind: string;
  regex: RegExp;
}

/**
 * Markers for output that was written for a developer looking at a terminal and
 * ended up in front of a stranger instead. Each one is specific to a runtime or
 * a framework, so a match is not ambiguous.
 */
const MARKERS: Marker[] = [
  { kind: "a JavaScript stack trace", regex: /\n\s+at\s+[\w$.<>[\]\s]*\(?(?:\/|[A-Za-z]:\\|node:|webpack|file:)/ },
  { kind: "a Python traceback", regex: /Traceback \(most recent call last\):/ },
  { kind: "a Java stack trace", regex: /\bat [\w$]+(?:\.[\w$]+)+\([\w$]+\.java:\d+\)/ },
  { kind: "a Java exception", regex: /\b(?:java|javax)\.[\w.]+(?:Exception|Error)\b/ },
  { kind: "a .NET exception", regex: /\bSystem\.[\w.]*Exception\b/ },
  { kind: "a PHP error", regex: /\b(?:Fatal error|Parse error|Warning|Notice):[^\n]{0,200}\bin\b[^\n]{0,200}\bon line \d+/ },
  { kind: "a PHP stack trace", regex: /Stack trace:\s*#0\s/ },
  { kind: "a Ruby stack trace", regex: /\bfrom [^\n]*\.rb:\d+:in [`']/ },
  { kind: "a Go panic", regex: /\bpanic: [^\n]+\n\ngoroutine \d+ \[/ },
  { kind: "a database error", regex: /\b(?:SQLSTATE\[|PG::\w+Error|PostgresError|SequelizeDatabaseError|MongoServerError|SQLITE_ERROR|ER_\w+: |ORA-\d{5})/ },
  { kind: "a database error", regex: /duplicate key value violates unique constraint|relation "[^"]+" does not exist|column "[^"]+" does not exist/ },
  { kind: "an ORM error with your query in it", regex: /PrismaClient\w*Error|Invalid `prisma\.|DrizzleQueryError|TypeORMError/ },
  { kind: "a framework debug page", regex: /Werkzeug Debugger|Whoops\\\\?Run|Whoops, looks like something went wrong|ActionView::Template::Error|Symfony\\\\Component\\\\|Illuminate\\\\Foundation/ },
  // Directories that are almost never the start of a URL path, so a match on
  // its own is enough.
  { kind: "a file path from your server", regex: /(?:\/(?:home|Users|var\/www|usr\/src|usr\/local\/src)\/)[\w.\-/]{3,}\.(?:js|mjs|cjs|ts|tsx|jsx|py|rb|php|go|java|cs|rs)\b/ },

  // `/app/`, `/srv/` and `/workspace/` are ordinary URL bases. Vite's
  // `base: '/app/'` puts `<script src="/app/assets/index-a1b2c3.js">` on the
  // page of a correctly built app, and matching that told the owner their app
  // was leaking server paths, quoting their own script tag back as proof.
  //
  // So these need corroboration: a line and column, or a stack frame, neither
  // of which appears in a markup attribute.
  {
    kind: "a file path from your server",
    regex: /(?:\bat\s+|\bfrom\s+|\(|^\s*)\/(?:app|srv|workspace)\/[\w.\-/]{3,}\.(?:js|mjs|cjs|ts|tsx|jsx|py|rb|php|go|java|cs|rs)(?::\d+(?::\d+)?)/m,
  },
  { kind: "a file path from your server", regex: /[A-Za-z]:\\(?:Users|inetpub|wwwroot|app)\\[\w.\\-]{3,}\.(?:js|ts|py|rb|php|cs)\b/ },
  { kind: "an environment variable with a value in it", regex: /\b(?:DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|AWS_SECRET_ACCESS_KEY|JWT_SECRET|SESSION_SECRET)\s*[:=]\s*\S{6,}/ },
];

/**
 * Only run against error responses and JSON, never against JavaScript bundles.
 * A minified bundle contains other people's error-handling code and would match
 * on text that is doing its job rather than text that leaked.
 */
export function findLeak(body: string): Leak | null {
  if (body.trim().length === 0) return null;
  for (const marker of MARKERS) {
    const match = marker.regex.exec(body);
    if (match) {
      const start = Math.max(0, match.index - 60);
      return { kind: marker.kind, excerpt: snippet(body.slice(start, match.index + 220), 240) };
    }
  }
  return null;
}

export function shouldInspect(status: number, contentType: string): boolean {
  if (/javascript|css|image\/|font|octet-stream/i.test(contentType)) return false;
  if (status >= 400) return true;
  return /json/i.test(contentType);
}

const TITLE = "What your app says when something goes wrong";

const METHOD =
  "Snaglist asked for addresses that do not exist and sent one deliberately broken request, then read every error your app sent back during the scan. It looked for the sort of output that is written for a developer reading a terminal: file paths from your server, database errors, and stack traces.";

function randomPath(): string {
  return Math.random().toString(36).slice(2, 12);
}

export const errorsCheck: Check = {
  id: "errors",
  title: TITLE,
  async run(ctx: ScanContext): Promise<CheckResult> {
    const probes = [`/${randomPath()}`, `/api/${randomPath()}`];

    for (const path of probes) {
      if (ctx.budget.exhausted()) break;
      await ctx.visit(ctx.origin + path);
    }

    // A route that exists, handed input it cannot possibly parse. This is the
    // probe that most often finds an unhandled exception. It is malformed, not
    // malicious: no payload here is designed to execute anything.
    const target = ctx.collected.apiPaths[0] ?? "/api/health";
    if (!ctx.budget.exhausted()) {
      await ctx.visit(ctx.origin + target, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"snaglist":',
      });
    }

    const inspected = ctx.captured.filter((response) =>
      shouldInspect(response.status, response.headers["content-type"] ?? ""),
    );

    if (inspected.length === 0) {
      return notChecked("errors", TITLE, {
        headline: "Snaglist did not get an error out of your app, so there was nothing to read.",
        why: "This check needs to see how your app behaves when something goes wrong, and nothing went wrong during the scan.",
        nextStep:
          "Not a problem in itself. If you want to know for certain, ask whoever reviews your app to try it with a broken request while watching what comes back.",
        method: METHOD,
      });
    }

    const leaks: Array<{ leak: Leak; url: string; status: number }> = [];
    for (const response of inspected) {
      const leak = findLeak(response.body);
      if (leak) leaks.push({ leak, url: response.url, status: response.status });
    }

    if (leaks.length > 0) {
      const evidence: Evidence[] = leaks.slice(0, 3).map((entry) => ({
        label: `${pathOf(entry.url)} answered with ${entry.status}`,
        detail: `Sent back ${entry.leak.kind}: ${entry.leak.excerpt}`,
      }));

      return result("errors", TITLE, {
        verdict: "attention",
        confidence: "high",
        headline: "When something breaks, your app tells the visitor how it is built.",
        why: "Error output like this names your files, your libraries, and sometimes your database structure. It is the map somebody uses to work out what else to try.",
        nextStep:
          "Switch your app to production mode on your host, which turns detailed errors off in most frameworks. Then add a catch-all handler that logs the real error where you can read it and sends the visitor a short message with no detail in it.",
        method: `${METHOD} It read ${inspected.length} ${inspected.length === 1 ? "answer" : "answers"} from your app.`,
        evidence,
      });
    }

    return result("errors", TITLE, {
      verdict: "pass",
      confidence: "medium",
      headline: "Your app's error messages kept the details to themselves.",
      why: "Error pages that name your files and libraries give away how your app is built, and yours did not.",
      nextStep:
        "Medium confidence, because Snaglist only broke your app in a few ways. A different mistake somewhere else could still produce a detailed error.",
      method: `${METHOD} It read ${inspected.length} ${inspected.length === 1 ? "answer" : "answers"} from your app.`,
    });
  },
};
