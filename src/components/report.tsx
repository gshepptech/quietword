import { REVIEW_CONTACT, REVIEW_PRICE } from "@/lib/review";
import type { CheckResult, ScanReport, Verdict } from "@/lib/scanner/types";

const VERDICT_LABEL: Record<Verdict, string> = {
  attention: "Worth fixing",
  pass: "Looks fine",
  not_checked: "Not checked",
};

// Colour never carries the verdict on its own. The word is always next to it.
const VERDICT_STYLE: Record<Verdict, string> = {
  attention: "border-clay text-clay",
  pass: "border-pass text-pass",
  not_checked: "border-unknown text-unknown",
};

const RULE_STYLE: Record<Verdict, string> = {
  attention: "bg-clay",
  pass: "bg-pass",
  not_checked: "bg-unknown",
};

const CONFIDENCE_LABEL = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
} as const;

function VerdictPill({ verdict }: { verdict: Verdict }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center border px-2.5 py-0.5 font-mono text-xs tracking-wide uppercase ${VERDICT_STYLE[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-1 block font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase">
      {children}
    </span>
  );
}

function CheckCard({ check, index }: { check: CheckResult; index: number }) {
  return (
    <article className="relative border border-line bg-surface pl-5">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${RULE_STYLE[check.verdict]}`} />

      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <span aria-hidden className="font-mono text-xs text-muted">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="text-xl">{check.title}</h3>
          </div>
          <VerdictPill verdict={check.verdict} />
        </div>

        <p className="mt-4 text-lg leading-snug">{check.headline}</p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <Label>Why it matters</Label>
            <p className="text-[0.9375rem] text-muted">{check.why}</p>
          </div>
          <div>
            <Label>What to do</Label>
            <p className="text-[0.9375rem] text-muted">{check.nextStep}</p>
          </div>
        </div>

        {check.evidence.length > 0 && (
          <ul className="mt-5 space-y-2 border-t border-line pt-5">
            {check.evidence.map((item, i) => (
              <li key={`${item.label}-${i}`} className="text-[0.9375rem]">
                <span className="font-mono text-sm text-ink">{item.label}</span>
                <span className="text-muted"> {item.detail}</span>
              </li>
            ))}
          </ul>
        )}

        <details className="mt-5 border-t border-line pt-4">
          <summary className="cursor-pointer font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase hover:text-ink">
            How Snaglist checked this
          </summary>
          <p className="mt-3 text-sm text-muted">{check.method}</p>
          {check.verdict !== "not_checked" && (
            <p className="mt-2 font-mono text-xs text-muted">{CONFIDENCE_LABEL[check.confidence]}</p>
          )}
        </details>
      </div>
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
    return `Nothing came back on the ${count(ran)} ${ran === 1 ? "check" : "checks"} Snaglist could run. ${count(notChecked).replace(/^\w/, (c) => c.toUpperCase())} could not be run at all.`;
  }

  const opener =
    attention === 1
      ? "One check found something worth fixing."
      : `${count(attention).replace(/^\w/, (c) => c.toUpperCase())} checks found something worth fixing.`;
  if (notChecked === 0) return opener;
  return `${opener} ${count(notChecked).replace(/^\w/, (c) => c.toUpperCase())} could not be run at all.`;
}

export function Report({ report }: { report: ScanReport }) {
  const seconds = Math.max(1, Math.round(report.durationMs / 1000));

  return (
    <section className="mt-10">
      <header className="border-t-2 border-ink pt-6">
        <h2 className="text-3xl sm:text-4xl">{summaryLine(report)}</h2>
        <p className="mt-3 font-mono text-sm text-muted">
          {report.target} · {report.budget.requestsUsed} requests · {seconds}s
        </p>
        <p className="mt-4 max-w-2xl text-[0.9375rem] text-muted">
          Five checks is not a security audit. Snaglist tested what your app shows the outside world.
          It did not see your database rules, your dependencies, or anything behind your login.
        </p>
        {report.budget.ranOut && (
          <p className="mt-3 max-w-2xl border-l-2 border-amber pl-3 text-[0.9375rem] text-muted">
            The scan hit its own limit before it finished, so some checks are marked not checked
            rather than passed. Running it again usually gets further.
          </p>
        )}
      </header>

      <div className="mt-6 space-y-4">
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
    <aside className="mt-12 border-t-2 border-ink pt-6">
      <h3 className="text-2xl">
        {found ? "Want someone to look at this properly?" : "The scan only sees the outside"}
      </h3>
      <p className="mt-4 max-w-2xl text-[0.9375rem] text-muted">
        {found
          ? `I go through the app by hand, work out which of these actually matter for your app rather than in general, and write it up in the same plain language. You get a list of what to fix, in the order I would fix it. ${REVIEW_PRICE}, usually back within three days.`
          : `Five checks passing means nothing obvious is showing from out here. It says nothing about your database rules, your dependencies, or the code behind your login. I go through those by hand and write up what I find in plain language. ${REVIEW_PRICE}, usually back within three days.`}
      </p>
      <a
        href={REVIEW_CONTACT}
        className="mt-6 inline-block border-b-2 border-forest pb-0.5 font-medium text-forest hover:border-forest-deep hover:text-forest-deep"
      >
        Send me the app to review
      </a>
    </aside>
  );
}
