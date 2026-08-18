import { NextResponse } from "next/server";

import { beginScan, endScan, releaseScanSlot, takeScanSlot } from "@/lib/ratelimit";
import { clientKey } from "@/lib/client-key";
import { normaliseTarget, runScan, TargetUnreachableError } from "@/lib/scanner";

// The scan resolves DNS and opens sockets, so it needs the Node runtime. It is
// also never cacheable: the answer is about a live third party server.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScanRequest {
  url: string;
  consent: boolean;
}

function readBody(value: unknown): ScanRequest | string {
  if (typeof value !== "object" || value === null) return "Send a url and a consent tick.";
  const body = value as Record<string, unknown>;
  if (typeof body["url"] !== "string") return "Paste the address of your live app to start.";
  if (body["consent"] !== true) {
    return "Tick the box to confirm you own this app or have permission to test it.";
  }
  return { url: body["url"], consent: true };
}

export async function POST(request: Request): Promise<NextResponse> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "That request did not arrive in one piece." }, { status: 400 });
  }

  const parsed = readBody(payload);
  if (typeof parsed === "string") {
    return NextResponse.json({ error: parsed }, { status: 400 });
  }

  const target = normaliseTarget(parsed.url);
  if (!target.ok) {
    return NextResponse.json({ error: target.reason }, { status: 400 });
  }

  const key = clientKey(request);
  const decision = takeScanSlot(key);
  if (!decision.allowed) {
    const minutes = Math.ceil((decision.retryAfterSeconds ?? 60) / 60);
    return NextResponse.json(
      {
        error: `That is five scans in the last fifteen minutes. Try again in about ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
      },
      { status: 429, headers: { "retry-after": String(decision.retryAfterSeconds ?? 60) } },
    );
  }

  if (!beginScan()) {
    releaseScanSlot(key);
    return NextResponse.json(
      { error: "Quietword is running as many scans as it can handle. Try again in a minute." },
      { status: 503, headers: { "retry-after": "60" } },
    );
  }

  try {
    const report = await runScan(target.url);
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof TargetUnreachableError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("scan failed", error);
    return NextResponse.json(
      { error: "The scan stopped part way through. Try again in a minute." },
      { status: 500 },
    );
  } finally {
    endScan();
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "Send a POST with a url and a consent tick." }, { status: 405 });
}
