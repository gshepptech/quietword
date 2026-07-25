import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDispatcher,
  guardedLookup,
  LIMITS,
  probe,
  readCapped,
  ScanBudget,
  USER_AGENT,
} from "@/lib/scanner/net";

/**
 * The scanner must not be usable as a way to reach something on the machine it
 * runs on. This test stands a real server up on loopback and proves the request
 * never arrives.
 */
describe("probe against loopback", () => {
  let server: Server;
  let port = 0;
  let hits = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"secret":"this should never be read"}');
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("refuses a loopback address and never opens the connection", async () => {
    const dispatcher = createDispatcher();
    const budget = new ScanBudget();
    const outcome = await probe(dispatcher, `http://127.0.0.1:${port}/`, budget);
    await dispatcher.close();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe("blocked");
      expect(outcome.message).toContain("loopback");
    }
    expect(hits).toBe(0);
  });

  it("refuses the same server addressed as IPv6 loopback", async () => {
    const dispatcher = createDispatcher();
    const outcome = await probe(dispatcher, `http://[::1]:${port}/`, new ScanBudget());
    await dispatcher.close();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("blocked");
    expect(hits).toBe(0);
  });

  it("refuses the cloud metadata address", async () => {
    const dispatcher = createDispatcher();
    const outcome = await probe(dispatcher, "http://169.254.169.254/latest/meta-data/", new ScanBudget());
    await dispatcher.close();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("blocked");
  });

  it("refuses a scheme it does not speak", async () => {
    const dispatcher = createDispatcher();
    const outcome = await probe(dispatcher, "file:///etc/passwd", new ScanBudget());
    await dispatcher.close();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("blocked");
  });
});

describe("guardedLookup", () => {
  it("refuses a hostname that points at the local machine", async () => {
    const error = await new Promise<Error | null>((resolve) => {
      guardedLookup("localhost", {}, (err) => resolve(err));
    });
    expect(error).not.toBeNull();
    expect(error?.name).toBe("BlockedAddressError");
  });

  it("refuses an internal network suffix", async () => {
    const error = await new Promise<Error | null>((resolve) => {
      guardedLookup("metadata.google.internal", {}, (err) => resolve(err));
    });
    expect(error?.name).toBe("BlockedAddressError");
  });
});

describe("ScanBudget", () => {
  it("stops once the request limit is reached", () => {
    const budget = new ScanBudget();
    for (let i = 0; i < LIMITS.requests; i += 1) budget.spendRequest();
    expect(budget.exhausted()).toBe("requests");
  });

  it("stops once the download limit is reached", () => {
    const budget = new ScanBudget();
    budget.spendBytes(LIMITS.bytesTotal);
    expect(budget.exhausted()).toBe("bytes");
  });

  it("returns a budget failure rather than making the request", async () => {
    const dispatcher = createDispatcher();
    const budget = new ScanBudget();
    for (let i = 0; i < LIMITS.requests; i += 1) budget.spendRequest();

    const outcome = await probe(dispatcher, "https://example.com/", budget);
    await dispatcher.close();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("budget");
    expect(budget.requestsUsed).toBe(LIMITS.requests);
  });
});

describe("readCapped", () => {
  async function* stream(chunks: Buffer[]) {
    for (const chunk of chunks) yield chunk;
  }

  it("reads a small body whole", async () => {
    const budget = new ScanBudget();
    const result = await readCapped(stream([Buffer.from("hello ") , Buffer.from("world")]), budget);
    expect(result.text).toBe("hello world");
    expect(result.truncated).toBe(false);
    expect(budget.bytesUsed).toBe(11);
  });

  it("cuts a body that goes past the per-response cap", async () => {
    const budget = new ScanBudget();
    const big = Buffer.alloc(LIMITS.bytesPerResponse + 1000, 0x61);
    const result = await readCapped(stream([big]), budget);
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBe(LIMITS.bytesPerResponse);
    expect(budget.bytesUsed).toBe(LIMITS.bytesPerResponse);
  });

  it("reads nothing once the whole-scan cap is gone", async () => {
    const budget = new ScanBudget();
    budget.spendBytes(LIMITS.bytesTotal);
    const result = await readCapped(stream([Buffer.from("anything")]), budget);
    expect(result.text).toBe("");
    expect(result.truncated).toBe(true);
  });
});

describe("user agent", () => {
  it("says who it is and does not pretend to be a browser", () => {
    expect(USER_AGENT).toContain("GreenlitScanner");
    expect(USER_AGENT).not.toMatch(/Mozilla|Chrome|Safari/);
  });
});
