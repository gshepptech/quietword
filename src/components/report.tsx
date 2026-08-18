import { REVIEW_CONTACT, REVIEW_PRICE } from "@/lib/review";
import type { CheckResult, ScanReport, Verdict } from "@/lib/scanner/types";

const VERDICT_LABEL: Record<Verdict, string> = {
  attention: "Worth fixing",
  pass: "Looks fine",
  not_checked: "Not checked",
};

// Colour never carries the verdict on its own. The word is always next to it,
// and the marker has a distinct shape per verdict as well as a distinct colour.
const VERDICT_STYLE: Record<Verdict, string> = {
  attention: "text-signal",
  pass: "text-clean",
  not_checked: "text-unknown",
};

const MARKER_STYLE: Record<Verdict, string> = {
  attention: "bg-signal",
  pass: "bg-clean",
  not_checked: "bg-unknown",
};

const EDGE_STYLE: Record<Verdict, string> = {
  attention: "bg-signal",
  pass: "bg-clean",
  not_checked: "bg-unknown",
};

const CONFIDENCE_LABEL = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
} as const;

function Verdict({ verdict }: { verdict: Verdict }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-2 ${VERDICT_STYLE[verdict]}`}>
      <span aria-hidden className={`size-2 ${MARKER_STYLE[verdict]}`} />
      <span className="meta !text-current">{VERDICT_LABEL[verdict]}</span>
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="meta mb-1.5 block">{children}</span>;
}

function CheckCard({ check, index }: { check: CheckResult; index: number }) {
  return (
    <article className="relative border border-line bg-surface">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${EDGE_STYLE[check.verdict]}`} />

      <div className="border-b border-line py-3 pr-5 pl-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3">
            <span aria-hidden className="meta tnum !text-ink">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="text-[0.9375rem] tracking-tight uppercase">{check.title}</h3>
          </div>
          <Verdict verdict={check.verdict} />
        </div>
      </div>

      <div className="px-6 py-5">
        <p className="max-w-[62ch] text-base leading-snug">{check.headline}</p>

        <div className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2">
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
          <div className="mt-5">
            <Label>
              Evidence · {check.evidence.length}{" "}
              {check.evidence.length === 1 ? "item" : "items"}
            </Label>
            <ul className="divide-y divide-line border border-line bg-raised">
              {check.evidence.map((item, i) => (
                <li key={`${item.label}-${i}`} className="px-4 py-3">
                  <span className="font-mono text-[0.8125rem] break-all text-ink">{item.label}</span>
                  <p className="mt-1 text-[0.8125rem] break-words text-muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <details className="border-t border-line">
        <summary className="meta cursor-pointer px-6 py-3 hover:text-ink">
          How Quietword checked this
          {check.verdict !== "not_checked" && ` · ${CONFIDENCE_LABEL[check.confidence]}`}
        </summary>
        <p className="max-w-[78ch] px-6 pb-5 text-[0.8125rem] text-muted">{check.method}</p>
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
 * The instrument strip. What was scanned, how much traffic it cost, and the
 * three counts. It is the first thing that says a machine did measurable work,
 * which the previous version left entirely to prose.
 */
function Readout({ report }: { report: ScanReport }) {
  const seconds = Math.max(1, Math.round(report.durationMs / 1000));
  // Target gets two columns because it is the one value someone reads back to
  // check it scanned the right thing, and an elided hostname cannot do that job.
  const cells: [string, string, string][] = [
    ["Target", report.target.replace(/^https?:\/\//, ""), "col-span-2"],
    ["Requests", `${report.budget.requestsUsed} of ${report.budget.requestLimit}`, ""],
    ["Elapsed", `${seconds}s`, ""],
    ["Worth fixing", String(report.summary.attention), ""],
    ["Looks fine", String(report.summary.passed), ""],
    ["Not checked", String(report.summary.notChecked), ""],
  ];

  return (
    <dl className="grid grid-cols-2 border border-line bg-surface sm:grid-cols-4 lg:grid-cols-7">
      {cells.map(([term, value, span]) => (
        <div key={term} className={`border-r border-b border-line px-4 py-3 ${span}`}>
          <dt className="meta">{term}</dt>
          <dd className="tnum mt-1 font-mono text-[0.8125rem] break-all text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Report({ report }: { report: ScanReport }) {
  return (
    <section className="mt-10">
      <header>
        <div className="flex items-baseline gap-3">
          <span aria-hidden className="h-3 w-3 bg-ink" />
          <span className="meta">Scan complete</span>
        </div>
        <h2 className="mt-3 max-w-[24ch] text-2xl sm:text-3xl">{summaryLine(report)}</h2>
      </header>

      <div className="mt-5">
        <Readout report={report} />
      </div>

      <p className="mt-4 max-w-[72ch] text-[0.875rem] text-muted">
        Five checks is not a security audit. Quietword tested what your app shows the outside world.
        It did not see your database rules, your dependencies, or anything behind your login.
      </p>

      {report.budget.ranOut && (
        <p className="mt-3 max-w-[72ch] border-l-2 border-focus bg-surface py-2 pl-3 text-[0.875rem] text-muted">
          The scan hit its own limit before it finished, so some checks are marked not checked
          rather than passed. Running it again usually gets further.
        </p>
      )}

      <div className="mt-6 space-y-3">
        {report.checks.map((check, index) => (
          <CheckCard key={check.id} check={check} index={index} />
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
    <aside className="mt-10 border-t-2 border-ink pt-6">
      <span className="meta">The part a scanner cannot do</span>
      <h3 className="mt-2 max-w-[26ch] text-xl sm:text-2xl">
        {found ? "Want someone to look at this properly?" : "The scan only sees the outside"}
      </h3>
      <p className="mt-3 max-w-[72ch] text-[0.875rem] text-muted">
        {found
          ? `I go through the app by hand, work out which of these actually matter for your app rather than in general, and write it up in the same plain language. You get a list of what to fix, in the order I would fix it. ${REVIEW_PRICE}, usually back within three days.`
          : `Five checks passing means nothing obvious is showing from out here. It says nothing about your database rules, your dependencies, or the code behind your login. I go through those by hand and write up what I find in plain language. ${REVIEW_PRICE}, usually back within three days.`}
      </p>
      <a
        href={REVIEW_CONTACT}
        className="mt-5 inline-block bg-ink px-5 py-2.5 text-[0.875rem] font-medium text-surface hover:bg-signal-deep"
      >
        Send me the app to review
      </a>
    </aside>
  );
}
