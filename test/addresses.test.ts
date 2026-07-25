import { describe, expect, it } from "vitest";

import { blockedHostnameReason, blockedReason, parseV6 } from "@/lib/scanner/addresses";

/**
 * This is the file that stops the scanner being pointed at somebody's internal
 * network. A false negative here is the most serious bug in the project, so the
 * cases are enumerated rather than sampled.
 */

describe("blockedReason, IPv4", () => {
  const blocked = [
    ["0.0.0.0", "unspecified"],
    ["10.0.0.1", "private"],
    ["10.255.255.255", "private"],
    ["100.64.0.1", "carrier-grade NAT"],
    ["127.0.0.1", "loopback"],
    ["127.5.99.3", "loopback"],
    ["169.254.169.254", "cloud metadata"],
    ["169.254.0.1", "link-local"],
    ["172.16.0.1", "private"],
    ["172.31.255.255", "private"],
    ["192.0.0.8", "protocol"],
    ["192.168.1.1", "private"],
    ["198.18.0.1", "benchmarking"],
    ["224.0.0.1", "multicast"],
    ["239.255.255.250", "multicast"],
    ["255.255.255.255", "reserved"],
  ] as const;

  for (const [address] of blocked) {
    it(`refuses ${address}`, () => {
      expect(blockedReason(address)).not.toBeNull();
    });
  }

  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.63.255.255", "11.0.0.1"];
  for (const address of allowed) {
    it(`allows ${address}`, () => {
      expect(blockedReason(address)).toBeNull();
    });
  }

  it("names the metadata range so the message is useful", () => {
    expect(blockedReason("169.254.169.254")).toContain("metadata");
  });
});

describe("blockedReason, IPv6", () => {
  const blocked = [
    "::",
    "::1",
    "fd00::1",
    "fc00::abcd",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "100::1",
    "64:ff9b::7f00:1",
  ];
  for (const address of blocked) {
    it(`refuses ${address}`, () => {
      expect(blockedReason(address)).not.toBeNull();
    });
  }

  // The interesting ones: an IPv4 address wearing an IPv6 costume.
  it("unwraps IPv4-mapped loopback", () => {
    expect(blockedReason("::ffff:127.0.0.1")).toContain("loopback");
  });

  it("unwraps IPv4-mapped private space", () => {
    expect(blockedReason("::ffff:10.0.0.1")).not.toBeNull();
  });

  it("unwraps IPv4-mapped metadata", () => {
    expect(blockedReason("::ffff:169.254.169.254")).not.toBeNull();
  });

  it("does not refuse an IPv4-mapped public address", () => {
    expect(blockedReason("::ffff:8.8.8.8")).toBeNull();
  });

  it("allows a normal public IPv6 address", () => {
    expect(blockedReason("2606:4700:4700::1111")).toBeNull();
  });

  it("refuses anything it cannot parse", () => {
    expect(blockedReason("not-an-address")).toBe("not a valid address");
    expect(blockedReason("")).toBe("not a valid address");
    expect(blockedReason("1.2.3")).toBe("not a valid address");
  });
});

describe("parseV6", () => {
  it("expands a compressed address to 16 bytes", () => {
    expect(parseV6("::1")).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("expands an embedded IPv4 address", () => {
    expect(parseV6("::ffff:192.168.0.1")?.slice(10)).toEqual([0xff, 0xff, 192, 168, 0, 1]);
  });

  it("rejects an address with too many groups", () => {
    expect(parseV6("1:2:3:4:5:6:7:8:9")).toBeNull();
  });
});

describe("blockedHostnameReason", () => {
  it("refuses the local machine by name", () => {
    expect(blockedHostnameReason("localhost")).not.toBeNull();
    expect(blockedHostnameReason("LOCALHOST")).not.toBeNull();
    expect(blockedHostnameReason("app.localhost")).not.toBeNull();
  });

  it("refuses local network suffixes", () => {
    for (const host of ["printer.local", "db.internal", "router.lan", "thing.home.arpa"]) {
      expect(blockedHostnameReason(host)).not.toBeNull();
    }
  });

  it("refuses a bare name with no public domain", () => {
    expect(blockedHostnameReason("myapp")).not.toBeNull();
  });

  it("refuses IP literals through the address rules", () => {
    expect(blockedHostnameReason("127.0.0.1")).not.toBeNull();
    expect(blockedHostnameReason("169.254.169.254")).not.toBeNull();
    expect(blockedHostnameReason("[::1]")).toContain("loopback");
  });

  it("allows a normal public hostname", () => {
    expect(blockedHostnameReason("example.com")).toBeNull();
    expect(blockedHostnameReason("my-app.vercel.app")).toBeNull();
    expect(blockedHostnameReason("example.com.")).toBeNull();
    expect(blockedHostnameReason("8.8.8.8")).toBeNull();
  });
});
