# Snaglist: project memory

Read this before doing anything. It is the brief, not a README. Full reasoning lives in
`docs/foundation.md`.

## 1. Context

Snaglist is a security and launch-readiness scanner for people who built a real app with AI coding
tools (Claude Code, Cursor, Replit, Lovable, Bolt) and have little or no security background. They
paste a live URL and get a plain-language report on the five most common gaps. It is aimed at one
person: a solo or near-solo founder who is technical enough to deploy and not technical enough to read
a bundle and spot an API key. Snaglist is explicitly not a security audit, not a pentest, not a
compliance product, and it never claims an app is secure.

**The paid human review is the product. The free scan is how people find it.** Automated scanning of
AI-built apps is a crowded, commoditised market as of July 2026: CheckVibe, Vibe App Scanner,
VibeSecurity, VibeDoctor, Scanbee and VibeEval all ship free scanners, and CheckVibe alone runs over
100 checks against our five. Competing on check count is a losing race we are not entering. Every one
of those competitors is automated only, and none of them sells a person who reads your app and tells
you what to do. That is the gap, and the five checks exist to earn the right to make that offer. Build
and price accordingly: the scan stays free forever, the review is what pays.

## 2. Hard guardrails (non-negotiable)

- **Private remote only.** A private GitHub repository under `gshepptech` is the backup, and
  pushing to it is expected. Never make the repository public and never add a second remote.
  This scanner sends deliberate request bursts at third-party servers, so the source becoming
  public is a different kind of problem from an ordinary leak.
- **No attribution to Claude, Claude Code, or Anthropic anywhere.** Not in commit messages, not in
  trailers, not in `Co-Authored-By`, not in README badges, not in code comments, not in package
  metadata. No exceptions. Commits are authored by the repo owner and read like a person wrote them.
- **Foundation before code.** `docs/foundation.md` is the plan. If the build has to diverge from it,
  update that file in the same commit as the change and say why.
- **No secrets in the repo.** `.env.example` holds placeholders. Real `.env` is gitignored.
- **A check never reports `pass` without evidence.** If a check could not gather what it needed, it
  reports `not_checked` with a reason. A false pass is the worst thing this product can do.
- **The product never tells a user their app is secure.** Not in the report, not in the CTA, not
  anywhere. It reports which of five checks came back clean, and it says five checks is not an audit.
  The brand is Snaglist, taken from a snagging list, the defect list an inspector writes before a
  new building is handed over. A clean scan is never reported as "no snags" or "all clear"; it is
  reported as which checks came back clean and what was not looked at. Enforced by
  `test/copy.test.ts`.

  Naming history: the product was called Greenlit until 25 July 2026. Dropped because Veracode holds
  a trademark on Greenlight for security scanning software, and greenlit.io and getgreenlit.xyz are
  both live products. Bare "Snag" was considered and rejected: SNAG LLC holds a registered software
  mark and Snagit is well known, so a single common noun is both hard to defend and easy to collide
  with.

  Snaglist was searched on 18 August 2026. This was a desk check, not legal clearance, and a
  solicitor should confirm it before any money goes on the name. What it found: no registered
  trademark for "Snaglist" or "Snag List" in software classes on the USPTO or Justia registers, and
  none surfaced on the UK register either, which is the one that matters most because "snag list" is
  a British and Irish building term. The risk is not a mark, it is a live product. Snaglist on the
  iOS App Store is a construction snagging app by Daniel McCann, shipping since at least March 2026
  at snaglist.dev, with paid tiers. Same spelling, same word, different field. The domains are close
  to gone: snaglist.io is the only obvious one still free, snaglist.dev, .app, .co and .xyz are all
  taken, getsnaglist.com was registered in November 2025 through an Irish registrar and does not
  serve a page, and snaglist.com is parked at HugeDomains asking 5,495 dollars.

  So the open question is not whether the name is legally clear. It is whether launching a security
  product called Snaglist against a live construction app called Snaglist is a collision worth
  accepting. Decide that before buying a domain.
- **Scanning guardrails are structural, not advisory.** Address denylist enforced at connect-time DNS
  lookup, manual redirect following with revalidation, request and time and byte budgets, truthful
  user agent, consent required. Do not weaken any of these for convenience. Details in
  `docs/foundation.md` section 7.
- **The scanner never sends an attack payload.** No injection strings, no traversal, no exploitation.
  It reads what the app volunteers, and it sends deliberately-invalid credentials to probe rate
  limits. Nothing else.
- **It has to actually run.** Install, build, test, and exercise the main path before calling anything
  done. If something cannot be verified locally, say so plainly rather than implying it passed.

## 3. Scope

Scope is locked. Do not add features beyond this list without being asked.

**In scope (MVP):**

- One form: paste a live app URL, tick a consent box, run the scan.
- Five checks, run server side:
  1. Exposed secrets or API keys visible in the frontend bundle.
  2. Missing authentication on API routes that should require it.
  3. No rate limiting on public-facing endpoints (signup, login, password reset).
  4. Verbose error messages leaking stack traces or internal details.
  5. Missing HTTPS enforcement.
- Per-check result in plain language: what was checked, what came back, why it matters, what to do
  next. Verdicts are `pass`, `attention`, or `not_checked`, each with a confidence level.
- No account, no email gate, no payment for the free scan.
- One non-alarmist call to action toward the paid manual review, worded so it does not imply the free
  scan was an audit.

**Out of scope. Do not build these:**

- The paid manual review product itself. The MVP has a link and a description, nothing more.
- Payment processing of any kind.
- Accounts, login, saved scan history, emailed reports.
- Supabase row-level security testing.
- Broken object level authorisation (BOLA) or other authorisation logic testing.
- Injection testing of any kind.
- Dependency CVE scanning.
- Repository scanning. The input is a URL, not a repo.
- Authenticated scanning. The scanner never holds a user's credentials.
- Scheduled or recurring scans.

## 4. Tech stack (fixed)

- Next.js, App Router, TypeScript. The scan must run server side, and this gives the form and the
  server route in one deployable unit.
- TypeScript with `strict` on. Real types. No `any` sprinkled to quiet the compiler.
- Tailwind CSS v4. Tokens in one `@theme` block in `src/app/globals.css`. No component library.
- `undici` for outbound HTTP. It is the only way to validate the resolved IP at connect time.
- Vitest for tests.
- `next/font/google`, self-hosted at build. No runtime font request.

Not used, on purpose: zod (one endpoint, two fields, hand-validated and tested), cheerio or a DOM
parser (only script tags are needed), any component or icon library.

## 5. Repo structure (fixed)

```
.
├── CLAUDE.md
├── README.md
├── .env.example
├── docs/foundation.md
├── src/
│   ├── app/
│   │   ├── layout.tsx          fonts, metadata, shell
│   │   ├── page.tsx            the one screen
│   │   ├── globals.css         Tailwind theme: palette, type scale
│   │   ├── icon.svg            the mark
│   │   └── api/scan/route.ts   consent gate, rate limit, calls the scanner
│   ├── components/             form, report, check card, verdict pill
│   └── lib/
│       ├── ratelimit.ts        in-memory limiter for our own endpoint
│       └── scanner/
│           ├── types.ts        Verdict, Confidence, CheckResult, ScanReport
│           ├── url.ts          input normalisation and validation
│           ├── addresses.ts    the address and hostname denylist
│           ├── net.ts          guarded request, connect-time lookup, budget
│           ├── context.ts      per-scan state shared across checks
│           ├── collect.ts      page + bundle gathering shared by checks
│           ├── index.ts        orchestration
│           └── checks/         one file per check, plus shared.ts
└── test/
    ├── fixtures/
    └── *.test.ts
```

Every check splits into pure analysis functions plus one `run` that does the I/O. Tests target the
pure half. A sixth check is a new file in `checks/` and a line in the registry. Do not build
abstraction layers for the out-of-scope list.

## 6. Design rules

Verbatim from the brief:

> Reference Linear, Stripe, Vercel, Arc, Raycast, and Notion for restraint and craft, not to copy them
> but to calibrate what considered looks like. No dark-mode-purple-gradient AI-startup template look.
> No glassmorphism or glow effects used as decoration without purpose. No stock icon-in-a-circle
> feature grids with filler content behind them. Pick one deliberate typography pairing, a distinct
> heading font plus a clean body font, and commit to it, do not ship default system fonts or overused
> Google Fonts like Poppins or Montserrat without a specific reason. Pick a real color palette with a
> point of view; do not default to indigo/violet-on-white or navy/electric-blue-on-black, both of which
> read instantly as generic AI-tool templates. Every screen should look like a specific product made a
> specific choice, not defaults assembled from a component library.

Also banned as generic-AI-template signals: dark mode with purple gradients, glassmorphism or glow as
decoration, icon-in-a-circle feature tiles with filler copy, default system font stacks, Poppins or
Montserrat without a reason, indigo or violet on white, navy or electric blue on black.

**The committed typeface pairing. Do not change it.**

- Headings: **Fraunces** (variable optical size serif). Distinctive, warm, reads as written by a
  person.
- Body: **IBM Plex Sans**. Clean, not Inter, not on every AI landing page.
- Evidence, URLs, code: **IBM Plex Mono**. Same family as the body face.

**The committed palette. Do not change it.** Warm paper and ink, not a dark security console. A
founder reading that their admin API is open should feel like they are reading a letter, not watching
a terminal fill with red.

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

Accessibility is part of the bar, not an extra. WCAG AA contrast on all text, visible focus on every
interactive element, keyboard operable, semantic HTML, results announced with `aria-live`. Verdict is
never carried by colour alone: every verdict has a word next to it.

## 7. Writing rules

These govern UI copy, marketing copy, documentation, README, error messages, empty states, and commit
messages. Verbatim from the brief:

> No em dashes anywhere in UI copy, marketing copy, or user-facing text, restructure the sentence
> instead. Banned words and phrases: unlock, elevate, leverage, seamless, robust, cutting-edge,
> revolutionize, empower, supercharge, game-changing, effortless, next-level, "in today's fast-paced
> world," "in an era where." No "it's not just X, it's Y" construction. No "Whether you're a ... or a
> ..." construction. No generic CTA phrasing like "Get Started Today", write CTAs specific to what the
> button does. No padding sentences that exist only to sound thorough; if a clause can be cut without
> losing meaning, cut it. Sentence case for headings and buttons, not Title Case, unless there's a
> specific reason. Write like one specific, opinionated person talking to one user, not marketing copy
> aimed at everyone. Keep the tone reassuring and plain-language, never alarmist or fear-based, this
> product's entire value is translating scary-sounding problems into calm, clear next steps. The
> product's own copy should never read as an obviously AI-generated or generic AI-wrapper product.

The full banned list, to be checked against before shipping any string: **unlock, elevate, leverage,
seamless, robust, cutting-edge, revolutionize, empower, supercharge, game-changing, effortless,
next-level, "in today's fast-paced world", "in an era where"**. Plus the constructions: no "it's not
just X, it's Y", no "Whether you're a ... or a ...", no generic CTA copy, no em dashes.

Two rules specific to this product:

- Never alarmist. "Your `/api/customers` endpoint returns customer email addresses to anyone who asks"
  is accurate and calm. "CRITICAL: your data is exposed" is neither.
- Never overclaim. The scan is five checks. The report says so in the report, not in a footnote.

## 8. Definition of done

A future session can check the build against these.

- `npm run build` passes with no TypeScript errors.
- `npm test` passes.
- All five checks run against a real live URL and return a report.
- No check returns `pass` on a path where it gathered no evidence. `not_checked` exists for that and
  carries a reason.
- Requests to loopback, private, link-local, and cloud metadata addresses are refused, with tests
  proving it.
- Redirects are followed manually and each hop is revalidated against the denylist.
- Request count, wall clock, and response byte budgets are enforced and a scan cannot exceed them.
- `POST /api/scan` rate limits per IP and rejects a request without consent.
- The form is keyboard operable, focus is visible, and the report is announced to screen readers.
- Every user-facing string is free of em dashes and the banned words, and reads as plain language a
  non-technical founder can act on.
- The CTA points at the paid human review without implying the free scan was an audit.
