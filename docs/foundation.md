# Snaglist: foundation

Written before implementation. If the build diverges from this document, this document gets updated
in the same commit as the change, with the reason.

## 1. The name

Working directory is `launch-check`. That was a placeholder. The product is **Snaglist**.

Three candidates were on the table.

**Loophole.** Memorable and it has a point of view, but it names the problem rather than the outcome,
and "loophole" carries a rule-dodging connotation from legal and insurance language. The product's
whole job is to sound calm. A name that sounds like an accusation works against that.

**ShipGuard.** Descriptive and clear, but the `-Guard` suffix is heavily occupied (CloudGuard,
SiteGuard, AppGuard, and a long tail below them). It reads as an enterprise security vendor, which is
exactly the register this audience finds intimidating. A founder who has never had a security
conversation does not want to buy from a vendor with a shield in its logo.

**Snaglist.** A snagging list is what an inspector writes before a new building is handed over:
the list of defects to put right, not a certificate that the building is sound. That is exactly
what this product produces, and the name says so before any copy has to. It sits in
launch-readiness language rather than security-vendor language, it is one word, and it carries no
fear.

Chosen: **Snaglist**.

The name was Greenlit until 25 July 2026. Dropped because Veracode holds a trademark on Greenlight
for security scanning software, and greenlit.io and getgreenlit.xyz are both live products.

Greenlit had a problem that Snaglist does not, and it is worth recording because it shaped the
copy rules. Greenlit meant permission to launch, which is precisely the thing a five-check scan
must never imply, so the name and the disclaimer pulled against each other and copy had to hold
the line. Snaglist points the other way: a list of snags is a list of things found, and a short
list is not a clean bill of health. The report still never says "your app is secure", and it still
says plainly that five checks is not an audit. This is carried into
CLAUDE.md as a hard copy rule so a future session does not undo it. See also "Risks and open
questions".

No candidate contains "Vibe" or "Preflight", both of which are taken by direct competitors.

## 2. What this is

A security and launch-readiness scanner for people who built a real app with AI coding tools and have
no security background.

The context: a May 2026 scan found roughly 5,000 publicly reachable AI-generated apps with zero
authentication, and about 40 percent of those were holding sensitive data. The people who shipped
those apps are not negligent. They used a tool that wrote working code and never mentioned that the
admin endpoint was open to the internet.

Two tiers are planned:

1. A free automated scan. Paste a live URL, get a plain-language report on five common gaps.
2. A paid manual review by a human, for anyone whose scan turns up something real or who wants a
   second opinion.

**Only tier one is being built.** The paid tier exists in this MVP as a single call to action and
nothing more.

## 3. Who it is for

One person: a founder, solo or nearly so, who shipped something real with Claude Code, Cursor,
Replit, Lovable, or Bolt. They have paying users or are about to. They are technical enough to deploy
but not technical enough to read a bundle and spot an API key. They have a low-grade worry that
something is wrong and no idea how to check.

What follows from that:

- They may not be able to read code. Findings are explained in terms of what someone could do, not in
  terms of headers and status codes.
- They will not know what to do next unless told. Every finding carries a next step.
- Fear is not a useful emotion here. Someone who gets scared closes the tab. Someone who gets a calm
  list of three things to fix goes and fixes them.
- They do not want an account. The free scan requires nothing.

## 4. MVP feature set

- One form: paste a live app URL, tick a consent box, run the scan.
- Five checks, run server side against the live app.
- A per-check result in plain language: what the check looked at, what came back, why it matters, and
  what to do next.
- Honest verdicts: `pass`, `attention`, or `not checked`. Never a pass when the check could not be
  run.
- No account, no email gate, no payment.
- One call to action toward the paid manual review, worded so it does not imply the free scan was an
  audit.

## 5. The five checks

Each check declares a detection method, a confidence level, and how it reports the case where it
could not determine anything. A check that cannot run reliably from outside the app reports
`not checked`. It never reports `pass`.

Confidence is reported to the user because the checks are not equally certain, and pretending they
are would be the same lie as reporting a false pass.

### 5.1 Exposed secrets in the frontend bundle

**Method.** Fetch the page HTML, extract inline scripts and same-origin `<script src>` URLs, fetch
those JavaScript assets up to the request and byte budget, and match the combined text against a set
of high-precision credential patterns: provider-prefixed keys (`AKIA`, `sk_live_`, `rk_live_`,
`sk-ant-`, `sk-proj-`, `ghp_`/`gho_`/`ghs_`/`ghu_`/`ghr_`, `github_pat_`, `xox[baprs]-`, `SG.`,
`re_`), database connection strings carrying a password, PEM private key headers, and JWTs whose
decoded payload claims a privileged role.

The highest-value case for this audience is a Supabase `service_role` JWT shipped to the browser.
That key bypasses row-level security completely. It is detected by base64-decoding any JWT found in
the bundle and reading the `role` claim, which is exact rather than heuristic.

**Deliberate non-findings.** Supabase anon keys, Firebase web config, Google browser API keys
(`AIza...`), Stripe publishable keys, and PostHog or Sentry public DSNs are meant to be in the
browser. Flagging them would be a false alarm and would teach the user to distrust the tool. They are
recognised and explicitly not reported.

The plan originally listed `AIza` keys as a finding. That was wrong for this audience and it was
changed during the build. Google documents the Firebase web `apiKey` as public by design, and a large
share of apps built with Lovable and Bolt ship one. Reporting it would have produced a false alarm on
a correctly-built app, which is the failure this check most needs to avoid. A Google key that is
missing its referrer restrictions is a real problem, but that is not determinable from the bundle, so
it belongs in the paid review rather than here.

**Confidence.** High when a match is found, because every pattern is a documented, provider-specific
key format rather than an entropy guess. Medium for a clean result, because code splitting means
there are almost certainly chunks the scanner never requested.

**Cannot determine.** If the HTML cannot be fetched or no JavaScript is reachable, the check reports
`not checked`.

**Known gap.** The brief also names "or a public repo". The scanner takes a URL, not a repository, so
the repo half is out of reach in this MVP. The report says so rather than quietly covering half the
check and calling it a pass.

### 5.2 Missing authentication on API routes

**Method.** Two sources of candidate routes. First, real routes: string literals matching `/api/...`
are extracted from the fetched JavaScript bundles, which is how the app's own frontend addresses its
backend. Second, a short list of conventional paths for the case where no bundle was readable.
Each candidate gets an unauthenticated GET.

A `200` alone is not a finding. Plenty of API routes are public on purpose. The response is parsed
and inspected for field names that indicate personal data (`email`, `phone`, `address`,
`password_hash`, `stripe_customer_id`, `api_key`, and similar). An open endpoint returning those is
the finding.

**Confidence.** High when an open endpoint returns personal-data-shaped fields. Medium for a clean
result, since the scanner only sees routes the frontend references or the guess list covers.

**Cannot determine.** If no candidate route responds as an existing endpoint, the check reports
`not checked` with the reason: nothing was found from outside to test.

### 5.3 No rate limiting on public endpoints

**Method.** Identify authentication-shaped endpoints (login, signup, register, reset, forgot, magic
link, OTP, waitlist, contact) from the extracted routes and the guess list. Confirm the endpoint
exists, then send a small burst of deliberately-invalid requests and watch for a `429`, a
`Retry-After` header, or `RateLimit-*` / `X-RateLimit-*` headers.

The burst is capped at 10 requests to one endpoint. Credentials sent are obviously fake so nothing
resembling a real login attempt is made against a real account.

**Confidence.** High for a pass, because a `429` or a rate-limit header is direct evidence the
limiter exists. Medium at best for a finding, because a limiter configured above the burst size will
not show up. The report says exactly that, in the user's language: "we sent 10 requests in a row and
none were turned away".

**Cannot determine.** No authentication-shaped endpoint found means `not checked`.

### 5.4 Verbose error messages

**Method.** Probe for error responses that were never meant to be seen: a random nonexistent path, a
deep nonexistent path, and malformed input to any discovered API route. Every response body collected
during the scan, not only these probes, is matched against stack-trace and framework-debug markers:
Node stack frames, Python tracebacks, Java and .NET exception class names, PHP warnings, absolute
filesystem paths, database driver errors, ORM internals, and the debug pages shipped by Werkzeug,
Whoops, Rails, Laravel, and Next.js.

**Confidence.** High when found. A stack trace in an HTTP response is not ambiguous. Medium for a
clean result, since only a handful of error paths were exercised.

**Cannot determine.** If no error response was obtained at all, the check reports `not checked`.

### 5.5 Missing HTTPS enforcement

**Method.** Confirm the site answers over HTTPS. Separately request the `http://` origin and follow
what happens: a `301` or `308` to the `https://` equivalent is enforcement. Read `Strict-Transport-Security`
from the HTTPS response and parse `max-age`.

**Confidence.** High in both directions. This is the one check that is fully determinable from
outside, and it is treated as such. Nothing answering on port 80 is a pass, not a failure. Enforcement
present but no HSTS is a pass with a note, not a finding, because the redirect is the thing that
protects the user.

**Cannot determine.** Only if neither scheme is reachable, at which point the whole scan has failed
anyway.

## 6. Explicitly out of scope

Not in this MVP. Not to be added without being asked.

- The paid manual review product. The MVP contains a link and a description, nothing more.
- Payment processing of any kind.
- Accounts, login, saved scan history, emailed reports.
- Supabase row-level security testing.
- Broken object level authorisation (BOLA) and other authorisation logic testing.
- Injection testing of any kind. The scanner never sends a payload designed to execute.
- Dependency CVE scanning.
- Repository scanning. The input is a URL.
- Authenticated scanning. The scanner never holds a user's credentials.
- Scheduled or recurring scans.
- Any scan of an app that has not been consented to by the person running the scan.

## 7. Scanning safely

Scanning a pasted URL means sending traffic to a third party server. That is the part of this product
that can do harm, so the constraints are structural rather than advisory.

**Address blocking.** The target hostname is resolved and every returned address is checked against a
denylist: loopback (`127.0.0.0/8`, `::1`), private ranges (`10/8`, `172.16/12`, `192.168/16`,
`fc00::/7`), link-local (`169.254/16`, `fe80::/10`) including the cloud metadata endpoint at
`169.254.169.254`, carrier-grade NAT (`100.64/10`), unspecified (`0.0.0.0/8`), multicast, and reserved
space. IPv4-mapped IPv6 addresses are unwrapped before checking, so `::ffff:127.0.0.1` does not slip
through.

The check runs inside the connection's DNS lookup, not before the request. Validating a hostname and
then calling `fetch` leaves a window where DNS can return a public address to the validator and a
private one to the socket. Doing it in the lookup means the address that gets connected to is the
address that got checked. This is why `undici` is a direct dependency: Node's global `fetch` gives no
way to reach the connect-time lookup.

The lookup is not sufficient on its own. Node skips DNS entirely when the host is already an IP
literal, so `http://169.254.169.254/` would never reach the guarded lookup at all. Every request,
including every redirect hop, therefore passes a second gate that checks the hostname directly before
the socket is opened. Both gates are tested, including with a real server standing on loopback that
the scanner must fail to reach.

**Redirects.** Followed manually, one hop at a time, capped at 4. Each hop goes back through the same
checks as the first request, so a redirect to `http://169.254.169.254/` fails the same way a direct
request would. Every hop counts against the request budget.

This is proven by `redirect revalidation` in `test/net.test.ts`, which hands `probe` a stubbed
transport that answers the first request with a 302 pointing at a private address, then throws if the
scanner ever sends a second request. It covers cloud metadata, IPv4 and IPv6 loopback, two private
ranges, `localhost` by name, an `.internal` suffix, and a scheme change to `file:`. The transport is
stubbed rather than stood up on a real host because the only server a test can bind is on loopback,
which the scanner refuses on the first hop; every guard stays inside `probe`, so a stubbed transport
gets past nothing the real one could not. Deleting the hop check makes all seven fail.

**Budgets.** Per scan: 40 requests, 25 seconds total wall clock, 8 seconds per request, 1.5 MB per
response body, 6 MB across the whole scan. The plan said 30 requests and 20 seconds. Adding up what
the five checks actually need came to roughly 30 requests in the worst case (2 for HTTPS, 6 for the
page and its scripts, 8 for API routes, 11 for the rate limit burst, 3 for error probes), which left
no headroom for redirects, so the ceiling moved up rather than the checks being cut. Bodies are read as a capped stream and truncated rather
than buffered whole. When the budget runs out, checks that had not run yet report `not checked`.
They do not report `pass`.

**Own-endpoint rate limiting.** `POST /api/scan` allows 5 scans per IP per 15 minutes, with a global
cap of 3 scans running at once. In-memory, which is honest about what it is: it resets on restart and
does not hold across multiple instances. Documented as a known limitation rather than dressed up.

**Identification.** Every request carries a truthful user agent, `SnaglistScanner/0.1`, with a
contact URL when `SCANNER_CONTACT_URL` is set. Someone reading their access logs should be able to
tell what hit them and why. The scanner does not spoof a browser.

**Consent.** The form requires an explicit tick that the user owns the app or has permission to test
it, and the API rejects a request without it. This is not a legal shield. It is there because the
alternative is a frictionless button for pointing traffic at someone else's server.

**Scheme and credential restrictions.** Only `http` and `https`. URLs carrying a username or password
are rejected. Non-default ports are allowed, since these apps are often on preview URLs, but the
address rules still apply.

## 8. Tech stack, and why

| Piece | Choice | Why |
| --- | --- | --- |
| Framework | Next.js (App Router) | The scan has to run server side: browsers cannot make cross-origin requests to arbitrary apps, and pointing a user's own browser at a target would be worse anyway. Next gives the form and the server route in one deployable thing, which is the right size for a one-page product. |
| Language | TypeScript, `strict` | Check results are a discriminated union. Getting a verdict wrong is the failure mode that matters most, so the compiler should be the first thing that catches it. |
| Styling | Tailwind CSS v4 | Design tokens live in one `@theme` block, which keeps the palette and type scale from drifting across sessions. No component library, because a component library is where the generic look comes from. |
| HTTP client | `undici` | The only way to validate the resolved IP at connect time (section 7). It is the same library Node's `fetch` is built on, maintained by the Node project. |
| Tests | Vitest | The check logic is pure functions over fixture text. Vitest runs TypeScript without a build step. |
| Fonts | `next/font/google`, self-hosted at build | No runtime request to Google, no layout shift, no third party on the critical path. |

Dependencies not added, and why:

- **No zod.** One endpoint with two fields. Hand-written validation is shorter than the schema would
  be, and it is tested.
- **No cheerio or a DOM parser.** The only HTML needed is script tags and their sources. A tested
  extractor over the raw text is a smaller surface than a parser, and it is not being asked to
  understand the document.
- **No component or icon library.** Nothing here needs one, and both are routes to a templated look.

## 9. Repo structure

```
.
├── CLAUDE.md                 project memory, read every session
├── README.md
├── .env.example              placeholders only, real .env is gitignored
├── docs/
│   └── foundation.md         this file
├── src/
│   ├── app/
│   │   ├── layout.tsx        fonts, metadata, page shell
│   │   ├── page.tsx          the one screen
│   │   ├── globals.css       Tailwind theme: palette, type scale
│   │   ├── icon.svg          the mark
│   │   └── api/scan/route.ts consent gate, rate limit, calls the scanner
│   ├── components/           form, report, per-check card, verdict pill
│   └── lib/
│       ├── ratelimit.ts      in-memory limiter for our own endpoint
│       └── scanner/
│           ├── types.ts      Verdict, Confidence, CheckResult, ScanReport
│           ├── url.ts        input normalisation and validation
│           ├── addresses.ts  the address and hostname denylist
│           ├── net.ts        guarded request, connect-time lookup, budget
│           ├── context.ts    per-scan state shared across checks
│           ├── collect.ts    page + bundle gathering shared by checks
│           ├── index.ts      orchestration, budget handover
│           └── checks/       one file per check, plus shared.ts
└── test/
    ├── fixtures/             captured response bodies to match against
    └── *.test.ts
```

Every check file splits into pure analysis functions and one `run` that does the I/O. The pure half is
what the tests exercise, because that is where a false pass would come from.

The sixth check, when it comes, is a file in `checks/` and a line in the registry. Nothing else is
built to anticipate it.

## 10. Design direction

Reference points for restraint: Linear, Stripe, Vercel, Arc, Raycast, Notion. Calibration, not copying.

The look is warm paper and ink rather than a dark security console. The reasoning is the product's
job: a founder reading that their admin API is open should feel like they are reading a letter, not
watching a terminal fill with red. Dark backgrounds and neon accents are the visual grammar of threat,
and this product is trying to lower the temperature.

**Typefaces.** Fraunces for headings, IBM Plex Sans for body, IBM Plex Mono for URLs and evidence.
Fraunces is a variable optical-size serif with real character in it, which reads as written by a
person. IBM Plex Sans is a clean workhorse that is not Inter and not on every AI landing page. The
mono is from the same family as the body face, so the evidence blocks sit inside the text rather than
next to it.

**Palette.** Warm paper, warm near-black ink, deep forest as the primary, clay for findings.

| Token | Hex | Use |
| --- | --- | --- |
| `paper` | `#FAF6EF` | Page background |
| `surface` | `#FFFFFF` | Cards |
| `ink` | `#1A1917` | Primary text |
| `muted` | `#6B6459` | Secondary text |
| `line` | `#E4DCCB` | Borders and rules |
| `forest` | `#1B4D3E` | Primary buttons, links |
| `forest-deep` | `#123528` | Hover and active |
| `pass` | `#2F6B4F` | Clean verdicts |
| `clay` | `#A63A17` | Findings |
| `unknown` | `#77706A` | Not checked |
| `amber` | `#B87514` | Focus ring, notes |

Deliberately not: indigo or violet on white, navy or electric blue on black, purple gradients,
glassmorphism, glow as decoration, icon-in-a-circle feature grids.

Accessibility is part of the bar. All text pairs meet WCAG AA against their background, focus is
visible on every interactive element, the form is keyboard-operable, results are announced with
`aria-live`, and verdict is never carried by colour alone: each verdict has a word next to it.

## 11. Writing direction

Plain language, one opinionated person talking to one user. No em dashes. Sentence case. Banned words
and constructions are listed in full in CLAUDE.md.

Two rules specific to this product:

- Never alarmist. "Your `/api/customers` endpoint returns customer email addresses to anyone who asks"
  is accurate and calm. "CRITICAL: your data is exposed" is neither.
- Never overclaim. The scan is five checks. The report says that, in the report, not in a footnote.

## 12. Definition of done for the MVP

- `npm run build` and `npm test` both pass.
- All five checks run against a real live URL and produce a report.
- No check returns `pass` on a path where it could not gather evidence.
- Loopback, private, and metadata addresses are refused, with a test proving it.
- The scan endpoint rate limits by IP and refuses a request without consent.
- The report reads as plain language and contains no jargon a non-technical founder would stumble on.
- No em dashes and no banned words in any user-facing string.

## 13. Risks and open questions

**The name has not had a trademark or domain check.** Snaglist is coherent with what the product
does, unlike the name it replaced, but nobody has checked whether it is available or defensible.
Do that before spending money on it. Bare "Snag" was already rejected for this reason: SNAG LLC
holds a registered software mark and Snagit is well known.

**The rate limit check will produce false findings.** A 10-request burst cannot distinguish "no limiter"
from "limiter set at 20". Reported at medium confidence with the method stated in the report, but some
users will read a finding where there is no problem. The alternative, a bigger burst, is closer to
attacking someone's login endpoint. Ten is the compromise. Watch this one.

**The auth check will miss more than it finds.** It only tests routes the frontend references plus a
short guess list. An app whose sensitive endpoints are never called from the public bundle looks clean.
The medium confidence and the "we tested N routes" line in the report are the mitigation, and they are
not a full one.

**Secret detection has a hard ceiling.** Code splitting means the scanner sees the entry chunk and
whatever it can discover, not the whole bundle. A key in a lazily-loaded admin chunk is invisible.

**In-memory rate limiting does not survive scale.** One instance, and it resets on deploy. Correct for
an MVP, wrong the moment there are two instances. Redis or the platform's own limiter when that
happens.

**The evidence for the idea is real but second hand.** The 5,000 apps figure and the 40 percent figure
come from the brief. They match the shape of what has been widely reported about AI-generated apps
shipping without auth, and the failure mode is well documented. The specific numbers have not been
independently verified for this build and should not be printed in marketing copy as though they were.

**Competition is genuine and some of it is free.** Multiple products occupy this exact space, which is
why "Vibe" and "Preflight" names were off the table. Free scanners of adjacent kinds already exist,
including generic header graders. The differentiator is not the checks, which are not novel; it is the
translation of the result into language this specific user can act on, and the human review behind it.
If the report reads like every other scanner's output, there is no product here.

**The paid tier is unvalidated.** Nothing in this MVP tests whether anyone will pay for a manual
review. The call to action is the only instrument, and click-through on it is the signal to watch
before building anything behind it.

**Legal exposure is not resolved.** A consent tick is not authorisation, and the operator of this
service is the one sending the traffic. Before this is public, the burst behaviour of the rate limit
check in particular deserves a real look, and terms of service are needed. Out of scope for the build,
noted here so it is not forgotten.
