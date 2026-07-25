import { isIP } from "node:net";

/**
 * The address denylist. This is the piece that stops the scanner from being
 * pointed at internal infrastructure, so it is written to be read and argued
 * with rather than to be clever.
 *
 * Everything here returns a human-readable reason instead of a boolean, because
 * the reason ends up in the user's error message and in the tests.
 */

interface Range4 {
  /** First octet-aligned prefix, as a 32-bit integer. */
  base: number;
  bits: number;
  reason: string;
}

const V4_RANGES: Range4[] = [
  { base: toInt(0, 0, 0, 0), bits: 8, reason: "an unspecified address range" },
  { base: toInt(10, 0, 0, 0), bits: 8, reason: "a private network range" },
  { base: toInt(100, 64, 0, 0), bits: 10, reason: "a carrier-grade NAT range" },
  { base: toInt(127, 0, 0, 0), bits: 8, reason: "the loopback range" },
  { base: toInt(169, 254, 0, 0), bits: 16, reason: "the link-local range, which includes cloud metadata services" },
  { base: toInt(172, 16, 0, 0), bits: 12, reason: "a private network range" },
  { base: toInt(192, 0, 0, 0), bits: 24, reason: "a reserved protocol range" },
  { base: toInt(192, 0, 2, 0), bits: 24, reason: "a documentation-only range" },
  { base: toInt(192, 168, 0, 0), bits: 16, reason: "a private network range" },
  { base: toInt(198, 18, 0, 0), bits: 15, reason: "a benchmarking range" },
  { base: toInt(198, 51, 100, 0), bits: 24, reason: "a documentation-only range" },
  { base: toInt(203, 0, 113, 0), bits: 24, reason: "a documentation-only range" },
  { base: toInt(224, 0, 0, 0), bits: 4, reason: "the multicast range" },
  { base: toInt(240, 0, 0, 0), bits: 4, reason: "a reserved range" },
];

function toInt(a: number, b: number, c: number, d: number): number {
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

function parseV4(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (part.length === 0 || part.length > 3 || !/^\d+$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return toInt(octets[0]!, octets[1]!, octets[2]!, octets[3]!);
}

/**
 * Expand an IPv6 address to 16 bytes, including the `::ffff:1.2.3.4` form.
 * Returns null if the address is not one Node would have handed us, which is
 * itself a reason to refuse the connection.
 */
export function parseV6(address: string): number[] | null {
  let text = address;

  // A zone index (fe80::1%en0) is never something we want to connect to anyway,
  // but strip it so the rest of the parse sees a clean address.
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);

  let trailingV4: number[] | null = null;
  const lastColon = text.lastIndexOf(":");
  if (lastColon !== -1 && text.slice(lastColon + 1).includes(".")) {
    const v4 = parseV4(text.slice(lastColon + 1));
    if (v4 === null) return null;
    trailingV4 = [(v4 >>> 24) & 0xff, (v4 >>> 16) & 0xff, (v4 >>> 8) & 0xff, v4 & 0xff];
    text = text.slice(0, lastColon + 1) + "0:0";
  }

  const doubleColon = text.indexOf("::");
  let groups: string[];
  if (doubleColon === -1) {
    groups = text.split(":");
  } else {
    const head = text.slice(0, doubleColon).split(":").filter((g) => g.length > 0);
    const tail = text.slice(doubleColon + 2).split(":").filter((g) => g.length > 0);
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...new Array<string>(missing).fill("0"), ...tail];
  }

  if (groups.length !== 8) return null;

  const bytes: number[] = [];
  for (const group of groups) {
    if (group.length === 0 || group.length > 4 || !/^[0-9a-fA-F]+$/.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes.push((value >> 8) & 0xff, value & 0xff);
  }

  if (trailingV4) {
    bytes[12] = trailingV4[0]!;
    bytes[13] = trailingV4[1]!;
    bytes[14] = trailingV4[2]!;
    bytes[15] = trailingV4[3]!;
  }

  return bytes;
}

function v6Prefix(bytes: number[], bits: number): string {
  const whole = Math.floor(bits / 8);
  const rest = bits % 8;
  const out: number[] = bytes.slice(0, whole);
  if (rest > 0) out.push(bytes[whole]! & (0xff << (8 - rest)));
  return out.join(".");
}

interface Range6 {
  prefix: number[];
  bits: number;
  reason: string;
}

const V6_RANGES: Range6[] = [
  { prefix: [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00], bits: 64, reason: "a discard-only range" },
  { prefix: [0x20, 0x01, 0x0d, 0xb8], bits: 32, reason: "a documentation-only range" },
  { prefix: [0x00, 0x64, 0xff, 0x9b], bits: 96, reason: "a NAT64 translation range" },
  { prefix: [0xfc], bits: 7, reason: "a unique local range" },
  { prefix: [0xfe, 0x80], bits: 10, reason: "the link-local range" },
  { prefix: [0xff], bits: 8, reason: "the multicast range" },
];

/**
 * Returns a reason string when the address must not be connected to, or null
 * when it is fine. Anything that cannot be parsed is refused, on the grounds
 * that an address we do not understand is not one we should dial.
 */
export function blockedReason(address: string): string | null {
  const version = isIP(address);

  if (version === 4) {
    const value = parseV4(address);
    if (value === null) return "not a valid address";
    for (const range of V4_RANGES) {
      const mask = range.bits === 0 ? 0 : (0xffffffff << (32 - range.bits)) >>> 0;
      if ((value & mask) >>> 0 === (range.base & mask) >>> 0) return range.reason;
    }
    return null;
  }

  if (version === 6) {
    const bytes = parseV6(address);
    if (!bytes) return "not a valid address";

    if (bytes.every((b) => b === 0)) return "an unspecified address range";
    if (bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1) return "the loopback range";

    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms wrap an
    // IPv4 address. Unwrap and apply the IPv4 rules, or ::ffff:127.0.0.1 walks
    // straight past the list above.
    const firstTen = bytes.slice(0, 10).every((b) => b === 0);
    if (firstTen && bytes[10] === 0xff && bytes[11] === 0xff) {
      return blockedReason(bytes.slice(12).join("."));
    }
    if (firstTen && bytes[10] === 0 && bytes[11] === 0) {
      return blockedReason(bytes.slice(12).join("."));
    }

    for (const range of V6_RANGES) {
      const padded = [...range.prefix, ...new Array<number>(16 - range.prefix.length).fill(0)];
      if (v6Prefix(bytes, range.bits) === v6Prefix(padded, range.bits)) return range.reason;
    }
    return null;
  }

  return "not a valid address";
}

/**
 * Hostnames that never point anywhere we want to go, checked before DNS so the
 * user gets a clear message instead of a connection error.
 */
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan"];

export function blockedHostnameReason(hostname: string): string | null {
  // A URL keeps IPv6 hosts in brackets. Strip them so the address rules see an
  // address rather than a name they do not recognise.
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (host.length === 0) return "an empty hostname";
  if (host === "localhost") return "the local machine";
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return "a local network name";
  if (isIP(host) !== 0) return blockedReason(host);
  // Bare names with no dot resolve through local search domains, which is a
  // route to internal hosts.
  if (!host.includes(".")) return "a name with no public domain";
  return null;
}
