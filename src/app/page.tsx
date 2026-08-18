import { Scanner } from "@/components/scanner";

import { REVIEW_CONTACT, REVIEW_PRICE } from "@/lib/review";

/**
 * Rendered per request so the content security policy can carry a fresh nonce.
 *
 * A prerendered page is built once, so there is no request to derive a nonce
 * from, and Next emits its script tags without one. The browser then refuses
 * every chunk and the form never hydrates. The alternative is 'unsafe-inline'
 * on scripts, which would switch off the part of the policy that matters, on a
 * product whose job is telling people about exactly this.
 *
 * The cost is small: one page, a few kilobytes, and no data to cache.
 */
export const dynamic = "force-dynamic";

const CHECKS = [
  {
    title: "Keys and passwords in your app's code",
    detail: "Whether your app is handing private keys to every visitor's browser.",
  },
  {
    title: "Data your app hands out without asking who you are",
    detail: "Whether any of your API addresses return people's information to a stranger.",
  },
  {
    title: "Limits on how fast someone can guess passwords",
    detail: "Whether your sign-in page lets someone try thousands of passwords in a row.",
  },
  {
    title: "What your app says when something goes wrong",
    detail: "Whether your error pages give away file paths and database details.",
  },
  {
    title: "Whether your app forces a secure connection",
    detail: "Whether someone arriving over an insecure link gets moved to the secure one.",
  },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="size-3 bg-ink" />
            <span className="font-display text-[0.9375rem] font-bold tracking-tight uppercase">
              Quietword
            </span>
          </div>
          <span className="meta">Free scan · or a person reads your app</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <span className="meta">Five checks · no account · no install</span>
        <h1 className="mt-3 max-w-[16ch] text-4xl sm:text-5xl">
          Find out what your app shows a stranger.
        </h1>
        <p className="mt-5 max-w-[68ch] text-base text-muted">
          Paste the address of an app you built. Quietword checks it for the five gaps that turn up
          most often in apps written with AI coding tools, then tells you what it found in plain
          language.
        </p>

        <div className="mt-8">
          <Scanner />
        </div>

        <section className="mt-16">
          <h2 className="text-lg tracking-tight uppercase">What Quietword looks at</h2>
          <ol className="mt-4 border border-line bg-surface">
            {CHECKS.map((check, index) => (
              <li
                key={check.title}
                className="flex gap-4 border-b border-line px-5 py-4 last:border-b-0"
              >
                <span aria-hidden className="meta tnum mt-0.5 !text-ink">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-[0.9375rem] font-medium">{check.title}</h3>
                  <p className="mt-1 text-[0.875rem] text-muted">{check.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="text-lg tracking-tight uppercase">What it does not cover</h2>
          <p className="mt-4 max-w-[72ch] text-[0.875rem] text-muted">
            Quietword looks at your app from outside, the same way a stranger would. It cannot see
            your database access rules, your dependencies, the code behind your login, or anything in
            your repository. Five checks catch the problems that come up most. They do not catch
            every problem.
          </p>
        </section>

        <section className="mt-14 border-t-2 border-ink pt-7">
          <span className="meta">The part a scanner cannot do</span>
          <h2 className="mt-2 text-xl sm:text-2xl">Or have a person read it</h2>
          <p className="mt-4 max-w-[72ch] text-[0.875rem] text-muted">
            The scan is a starting point. A review is me going through your app by hand: the parts
            the scan cannot reach, your database access rules, what your login actually protects,
            and which of the scan findings matter for your app rather than in general.
          </p>
          <p className="mt-3 max-w-[72ch] text-[0.875rem] text-muted">
            You get a written list of what to fix, ordered by what I would do first, in the same
            plain language as the scan. No tooling to install and no code knowledge needed to read
            it. {REVIEW_PRICE}, usually back within three days.
          </p>
          <a
            href={REVIEW_CONTACT}
            className="mt-5 inline-block bg-ink px-5 py-2.5 text-[0.875rem] font-medium text-surface hover:bg-signal-deep"
          >
            Send me the app to review
          </a>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-4xl px-6 py-7 text-[0.8125rem] text-muted">
          <p>
            The scan is free and always will be. The review is how this pays for itself. Only scan
            an app you own or have permission to test.
          </p>
          <p className="mt-2">
            Quietword identifies itself as{" "}
            <code className="font-mono text-[0.8125rem] text-ink">QuietwordScanner/0.1</code> in your access logs.
          </p>
        </div>
      </footer>
    </div>
  );
}
