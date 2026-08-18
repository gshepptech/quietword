import { REVIEW_CONTACT, REVIEW_PRICE } from "@/lib/review";
import type { CheckResult, ScanReport, Verdict } from "@/lib/scanner/types";

const VERDICT_LABEL: Record<Verdict, string> = {
  attention: "Worth fixing",
  pass: "Looks fine",
  not_checked: "Not checked",
};

// Colour never carries the verdict alone. Each one has a word, and a marker
// whose shape differs too, so it survives greyscale and colour blindness both.
const VERDICT_TEXT: Record<Verdict, string> = {
  attention: "text-signal",
  pass: "text-clean",
  not_checked: "text-unknown",
};

const CONFIDENCE_LABEL = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
} as const;

function Marker({ verdict }: { verdict: Verdict }) {
  if (verdict === "attention") {
    return <span aria-hidden className="size-2 rotate-45 bg-signal" />;
  }
  if (verdict === "pass") {
    return <span aria-hidden className="size-2 rounded-full bg-clean" />;
  }
  return <span aria-hidden className="h-[2px] w-2.5 bg-unknown" />;
}

function Verdict({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 ${VERDICT_TEXT[verdict]}`}>
      <Marker verdict={verdict} />
      <span className="meta !text-current">{VERDICT_LABEL[verdict]}</span>
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="meta mb-2 block">{children}</span>;
}

function CheckCard({ check }: { check: CheckResult }) {
  const found = check.verdict === "attention";

  return (
    <article className={`panel overflow-hidden ${found ? "panel-raised" : ""}`}>
      <div
        className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 sm:px-6 ${
          found ? "bg-signal-wash" : "bg-inset"
        }`}
      >
        <h3 className="text-[0.9375rem] leading-tight font-semibold tracking-[-0.01em]">
          {check.title}
        </h3>
        <Verdict verdict={check.verdict} />
      </div>

      <div className="px-5 pt-5 pb-1 sm:px-6">
        <p className="max-w-[58ch] text-[1.0625rem] leading-[1.45] font-medium text-ink-soft">
          {check.headline}
        </p>

        <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <div>
            <Label>Why it matters</Label>
            <p className="text-[0.875rem] text-muted">{check.why}</p>
          </div>
          <div>
            <Label>What to do</Label>
            <p className="text-[0.875rem] text-muted">{check.nextStep}</p>
          </div>
        </div>

        {check.evidence.length > 0 && (
          <div className="mt-6">
            <Label>
              What came back · {check.evidence.length}{" "}
              {check.evidence.length === 1 ? "item" : "items"}
            </Label>
            <ul className="space-y-2">
              {check.evidence.map((item, i) => (
                <li
                  key={`${item.label}-${i}`}
                  className="rounded-[--radius-inset] bg-inset px-4 py-3"
                >
                  <span className="font-mono text-[0.8125rem] font-medium break-all text-ink">
                    {item.label}
                  </span>
                  <p className="mt-1 text-[0.8125rem] break-words text-muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <details className="group mt-4">
        <summary className="meta flex cursor-pointer items-center gap-2 px-5 py-3.5 hover:text-ink sm:px-6">
          <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
          How Quietword checked this
          {check.verdict !== "not_checked" && ` · ${CONFIDENCE_LABEL[check.confidence]}`}
        </summary>
        <p className="max-w-[76ch] px-5 pb-5 text-[0.8125rem] text-muted sm:px-6">{check.method}</p>
      </details>
    </article>
  );
}

// There are only ever five checks, so the counts read as words rather than as
// a heading with digits in the middle of a sentence.
const WORDS = ["none", "one", "two", "three", "four", "five"] as const;

function count(n: number): string {
  return WORDS[n] ?? String(n);
}

function summaryLine(report: ScanReport): string {
  const { attention, notChecked } = report.summary;
  const total = report.checks.length;
  const ran = total - notChecked;

  if (attention === 0 && notChecked === 0) {
    return `All ${count(total)} checks came back clean.`;
  }
  if (attention === 0) {
    return `Nothing came back on the ${count(ran)} ${ran === 1 ? "check" : "checks"} Quietword could run. ${count(notChecked).replace(/^\w/, (c) => c.toUpperCase())} could not be run at all.`;
  }

  const opener =
    attention === 1
      ? "One check found something worth fixing."
      : `${count(attention).replace(/^\w/, (c) => c.toUpperCase())} checks found something worth fixing.`;
  if (notChecked === 0) return opener;
  return `${opener} ${count(notChecked).replace(/^\w/, (c) => c.toUpperCase())} could not be run at all.`;
}

/**
 * The signature. Every other scanner reports what it found; this one also
 * reports what it cost, because refusing to hammer somebody's server is the
 * guardrail this product actually sells. The meter is the request budget drawn
 * to scale against its own ceiling, which is a fact no competitor puts on the
 * page and which is only interesting because the ceiling is real.
 */
function Ledger({ report }: { report: ScanReport }) {
  const seconds = Math.max(1, Math.round(report.durationMs / 1000));
  const spent = report.budget.requestsUsed;
  const limit = report.budget.requestLimit;
  const pct = Math.min(100, Math.round((spent / limit) * 100));

  return (
    <div className="panel px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="meta">Requests spent on your server</span>
        <span className="tnum font-mono text-[0.8125rem] text-muted">
          <span className="text-ink">{spent}</span> of {limit} · {seconds}s elapsed
        </span>
      </div>

      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ground-deep">
        <div
          className="tick h-full rounded-full bg-ink"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>

      <dl className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
        {(
          [
            ["Worth fixing", report.summary.attention, "attention"],
            ["Looks fine", report.summary.passed, "pass"],
            ["Not checked", report.summary.notChecked, "not_checked"],
          ] as [string, number, Verdict][]
        ).map(([term, value, verdict]) => (
          <div key={term}>
            <dt className="meta flex items-center gap-1.5">
              <Marker verdict={verdict} />
              {term}
            </dt>
            <dd
              className={`tnum mt-1.5 font-display text-2xl leading-none font-bold ${
                value > 0 && verdict === "attention" ? "text-signal" : "text-ink"
              }`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Report({ report }: { report: ScanReport }) {
  return (
    <section className="mt-12">
      <header>
        <span className="meta">Scan complete · {report.target.replace(/^https?:\/\//, "")}</span>
        <h2 className="mt-3 max-w-[20ch] text-[2rem] sm:text-[2.5rem]">{summaryLine(report)}</h2>
      </header>

      <div className="mt-6">
        <Ledger report={report} />
      </div>

      <p className="mt-5 max-w-[68ch] text-[0.875rem] text-muted">
        Five checks is not a security audit. Quietword tested what your app shows the outside world.
        It did not see your database rules, your dependencies, or anything behind your login.
      </p>

      {report.budget.ranOut && (
        <p className="mt-4 max-w-[68ch] rounded-[--radius-inset] border-l-2 border-focus bg-surface py-3 pr-4 pl-4 text-[0.875rem] text-muted">
          The scan hit its own limit before it finished, so some checks are marked not checked
          rather than passed. Running it again usually gets further.
        </p>
      )}

      <div className="mt-8 space-y-4">
        {report.checks.map((check) => (
          <CheckCard key={check.id} check={check} />
        ))}
      </div>

      <ReviewOffer found={report.checks.some((check) => check.verdict === "attention")} />
    </section>
  );
}

/**
 * The scan is the lead magnet and this is the product, so it sits at the end of the
 * report where someone has just read their own results. Two versions, because the
 * reason to want a person is different depending on what the scan came back with.
 */
function ReviewOffer({ found }: { found: boolean }) {
  return (
    <aside className="panel mt-10 px-6 py-7 sm:px-8 sm:py-8">
      <span className="meta">The part a scanner cannot do</span>
      <h3 className="mt-2.5 max-w-[24ch] text-[1.5rem] sm:text-[1.75rem]">
        {found ? "Want someone to look at this properly?" : "The scan only sees the outside"}
      </h3>
      <p className="mt-4 max-w-[66ch] text-[0.9375rem] text-muted">
        {found
          ? `I go through the app by hand, work out which of these actually matter for your app rather than in general, and write it up in the same plain language. You get a list of what to fix, in the order I would fix it. ${REVIEW_PRICE}, usually back within three days.`
          : `Five checks passing means nothing obvious is showing from out here. It says nothing about your database rules, your dependencies, or the code behind your login. I go through those by hand and write up what I find in plain language. ${REVIEW_PRICE}, usually back within three days.`}
      </p>
      <a
        href={REVIEW_CONTACT}
        className="mt-6 inline-flex items-center gap-2 rounded-[--radius-inset] bg-ink px-5 py-3 text-[0.875rem] font-medium text-surface shadow-[0_1px_2px_rgba(16,21,27,0.3)] transition-colors hover:bg-signal-deep"
      >
        Send me the app to review
        <span aria-hidden>→</span>
      </a>
    </aside>
  );
}
