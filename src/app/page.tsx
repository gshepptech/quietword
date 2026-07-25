import { Scanner } from "@/components/scanner";

const REVIEW_CONTACT = process.env.NEXT_PUBLIC_REVIEW_CONTACT ?? "mailto:hello@example.com";

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
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-baseline gap-3 px-6 py-5">
          <span className="font-display text-lg font-semibold tracking-tight">Greenlit</span>
          <span className="font-mono text-xs text-muted">five checks, no account</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <h1 className="max-w-[18ch] text-4xl sm:text-5xl">
          Find out what your app shows a stranger.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Paste the address of an app you built. Greenlit checks it for the five gaps that turn up
          most often in apps written with AI coding tools, then tells you what it found in plain
          language. Nothing to install, no account, no email.
        </p>

        <div className="mt-10">
          <Scanner />
        </div>

        <section className="mt-20">
          <h2 className="text-2xl">What Greenlit looks at</h2>
          <ol className="mt-6 border-t border-line">
            {CHECKS.map((check, index) => (
              <li key={check.title} className="flex gap-5 border-b border-line py-5">
                <span aria-hidden className="mt-1 font-mono text-xs text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-base font-medium">{check.title}</h3>
                  <p className="mt-1 text-[0.9375rem] text-muted">{check.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl">What it does not cover</h2>
          <p className="mt-5 max-w-2xl text-muted">
            Greenlit looks at your app from outside, the same way a stranger would. It cannot see
            your database access rules, your dependencies, the code behind your login, or anything in
            your repository. Five checks catch the problems that come up most. They do not catch
            every problem.
          </p>
          <p className="mt-4 max-w-2xl text-muted">
            If a check came back with something and you are not sure what to do about it, or you
            would rather have a person look properly, I go through apps by hand and write up what I
            find in the same plain language.
          </p>
          <a
            href={REVIEW_CONTACT}
            className="mt-6 inline-block border-b-2 border-forest pb-0.5 font-medium text-forest hover:border-forest-deep hover:text-forest-deep"
          >
            Ask for a manual review
          </a>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-3xl px-6 py-8 text-sm text-muted">
          <p>Only scan an app you own or have permission to test.</p>
          <p className="mt-2">
            Greenlit identifies itself as{" "}
            <code className="font-mono text-ink">GreenlitScanner/0.1</code> in your access logs.
          </p>
        </div>
      </footer>
    </div>
  );
}
