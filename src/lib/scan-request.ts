export interface ScanRequest {
  url: string;
  consent: true;
  /** Active checks run only when the caller sends `active: true`. */
  active: boolean;
}

/** Reads the body of `POST /api/scan`, or returns the message to show the user. */
export function readScanRequest(value: unknown): ScanRequest | string {
  if (typeof value !== "object" || value === null) return "Send a url and a consent tick.";
  const body = value as Record<string, unknown>;
  if (typeof body["url"] !== "string") return "Paste the address of your live app to start.";
  if (body["consent"] !== true) {
    return "Tick the box to confirm you own this app or have permission to test it.";
  }
  return { url: body["url"], consent: true, active: body["active"] === true };
}
