import type { ScanContext } from "./context";
import { sameOriginUrl } from "./url";

/** Scripts fetched per scan. Enough to reach the entry chunk and its neighbours. */
const MAX_SCRIPTS = 5;

const SCRIPT_TAG = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
const SELF_CLOSING_SCRIPT = /<script\b([^>]*?)\/?>/gi;
const SRC_ATTR = /\bsrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/**
 * Pull `src` values out of script tags. A real HTML parser would be more
 * correct, but the only thing needed here is script sources, and a tested
 * extractor is a smaller surface than a parser that has opinions about the
 * rest of the document.
 */
export function extractScriptSources(html: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  const collect = (attrs: string) => {
    const match = SRC_ATTR.exec(attrs);
    if (!match) return;
    const value = (match[2] ?? match[3] ?? match[4] ?? "").trim();
    if (value.length === 0 || seen.has(value)) return;
    seen.add(value);
    found.push(value);
  };

  for (const match of html.matchAll(SCRIPT_TAG)) collect(match[1] ?? "");
  for (const match of html.matchAll(SELF_CLOSING_SCRIPT)) collect(match[1] ?? "");

  return found;
}

/** Script tag bodies, which is where hand-written keys most often end up. */
export function extractInlineScripts(html: string): string[] {
  const bodies: string[] = [];
  for (const match of html.matchAll(SCRIPT_TAG)) {
    const body = (match[2] ?? "").trim();
    if (body.length > 0) bodies.push(body);
  }
  return bodies;
}

const API_PATH = /["'`](\/api\/[A-Za-z0-9._~\-/]*)["'`]/g;

/**
 * Routes the frontend itself calls. Guessing paths finds the obvious apps;
 * reading the bundle finds the actual ones.
 */
export function extractApiPaths(text: string): string[] {
  const seen = new Set<string>();
  for (const match of text.matchAll(API_PATH)) {
    let path = match[1] ?? "";
    if (path.length < 6) continue;
    // Trailing slash usually means the code appends an id next. The collection
    // route is the interesting one either way.
    if (path.endsWith("/") && path !== "/api/") path = path.slice(0, -1);
    if (path === "/api" || path === "/api/") continue;
    if (path.split("/").length > 6) continue;
    seen.add(path);
  }
  return [...seen].sort();
}

/**
 * Fetch the page and its scripts once, so five checks are not five crawls.
 */
export async function collect(ctx: ScanContext): Promise<void> {
  const page = await ctx.visit(ctx.origin + "/");
  if (!page.ok) {
    ctx.collected.pageError = page.message;
    return;
  }
  ctx.collected.page = page;

  const html = page.body;
  const inline = extractInlineScripts(html);

  const sources = extractScriptSources(html)
    .map((src) => sameOriginUrl(ctx.origin, src))
    .filter((url): url is string => url !== null)
    .slice(0, MAX_SCRIPTS);

  for (const url of sources) {
    if (ctx.budget.exhausted()) break;
    const asset = await ctx.visit(url);
    if (!asset.ok || asset.body.length === 0) continue;
    ctx.collected.scripts.push({ url, body: asset.body, truncated: asset.bodyTruncated });
  }

  const parts = [html, ...inline, ...ctx.collected.scripts.map((s) => s.body)];
  ctx.collected.bundleText = parts.join("\n");
  ctx.collected.apiPaths = extractApiPaths(ctx.collected.bundleText);
}
