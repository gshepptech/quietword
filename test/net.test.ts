import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";

import type { Agent } from "undici";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createDispatcher,
  discard,
  guardedLookup,
  LIMITS,
  probe,
  readCapped,
  type Requester,
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
    expect(USER_AGENT).toContain("QuietwordScanner");
    expect(USER_AGENT).not.toMatch(/Mozilla|Chrome|Safari/);
  });
});

/**
 * Destroying an undici body while the request is still in flight makes the
 * stream emit an AbortError, and with no listener attached that becomes an
 * uncaught exception. The scanner does this on every redirect it follows.
 */
describe("discard", () => {
  it("swallows the error a stream raises when it is thrown away mid-flight", () => {
    const listeners: Array<() => void> = [];
    let destroyed = false;
    const body = {
      on(event: string, fn: () => void) {
        if (event === "error") listeners.push(fn);
      },
      destroy() {
        destroyed = true;
        // What undici does: raise on the stream rather than on the caller.
        for (const fn of listeners) fn();
      },
    };

    expect(() => discard(body)).not.toThrow();
    expect(destroyed).toBe(true);
    expect(listeners.length).toBe(1);
  });

  it("does nothing when handed something that is not a stream", () => {
    expect(() => discard(null)).not.toThrow();
    expect(() => discard("a string")).not.toThrow();
  });
});

/**
 * The redirect gate. A scanner that validates the address the user typed and
 * then follows a 302 wherever it points is not a guarded scanner at all, so
 * every hop goes back through the same checks as the first request.
 *
 * The requester is stubbed here rather than stood up on a real host, because
 * the only reachable server a test can bind is on loopback, which the scanner
 * refuses on the first hop. Stubbing the transport leaves every guard in
 * `probe` where it lives.
 */
describe("redirect revalidation", () => {
  function emptyBody(): AsyncIterable<Buffer> & { destroy(): void; on(): void } {
    return {
      async *[Symbol.asyncIterator]() {},
      destroy() {},
      on() {},
    };
  }

  function redirectingTo(location: string): { send: Requester; calls: string[] } {
    const calls: string[] = [];
    const send: Requester = async (url) => {
      calls.push(url);
      if (calls.length > 1) {
        throw new Error(`the scanner sent a request it should have refused: ${url}`);
      }
      return { statusCode: 302, headers: { location }, body: emptyBody() };
    };
    return { send, calls };
  }

  it.each([
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/", "link-local"],
    ["loopback", "http://127.0.0.1:8080/admin", "loopback"],
    ["a private network", "http://10.0.0.5/internal", "private"],
    ["another private range", "http://192.168.1.1/", "private"],
    ["IPv6 loopback", "http://[::1]:3000/", "loopback"],
    ["the local machine by name", "http://localhost:5432/", "local machine"],
    ["an internal suffix", "http://vault.internal/secrets", "local network name"],
  ])("refuses a redirect to %s and never sends the second request", async (_name, location, reason) => {
    const { send, calls } = redirectingTo(location);
    const budget = new ScanBudget();

    const outcome = await probe({} as Agent, "https://redirector.example/", budget, {}, send);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe("blocked");
      expect(outcome.message).toContain(reason);
    }
    // One request went out, to the address that was allowed. The hop was not made.
    expect(calls).toEqual(["https://redirector.example/"]);
    expect(budget.requestsUsed).toBe(1);
  });

  it("refuses a redirect that changes to a scheme it does not speak", async () => {
    const { send, calls } = redirectingTo("file:///etc/passwd");
    const outcome = await probe({} as Agent, "https://redirector.example/", new ScanBudget(), {}, send);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("blocked");
    expect(calls).toHaveLength(1);
  });

  it("follows a redirect to a public address and records the chain", async () => {
    const calls: string[] = [];
    const send: Requester = async (url) => {
      calls.push(url);
      if (calls.length === 1) {
        return { statusCode: 301, headers: { location: "https://www.example.com/" }, body: emptyBody() };
      }
      return {
        statusCode: 200,
        headers: { "content-type": "text/html" },
        body: emptyBody(),
      };
    };

    const outcome = await probe({} as Agent, "https://example.com/", new ScanBudget(), {}, send);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.url).toBe("https://www.example.com/");
      expect(outcome.chain).toEqual(["https://example.com/", "https://www.example.com/"]);
    }
  });

  it("stops rather than following a redirect loop forever", async () => {
    const calls: string[] = [];
    const send: Requester = async (url) => {
      calls.push(url);
      return { statusCode: 302, headers: { location: "https://example.com/next" }, body: emptyBody() };
    };

    const budget = new ScanBudget();
    const outcome = await probe({} as Agent, "https://example.com/", budget, {}, send);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("too_many_redirects");
    expect(calls.length).toBe(LIMITS.redirects + 1);
  });
});
