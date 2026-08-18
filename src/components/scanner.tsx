"use client";

import { useId, useRef, useState } from "react";

import { Report } from "@/components/report";
import type { ScanReport } from "@/lib/scanner/types";

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; report: ScanReport }
  // redpen-ignore:generic-error-message "error" here is the state discriminant and a payload key, not a string shown to anyone. Every message a user reads on this screen comes from the server and names what failed and what to do next; the only local fallback is "The scan did not come back. Try again in a minute."
  | { status: "error"; message: string };

export function Scanner() {
  const [url, setUrl] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });
  const resultsRef = useRef<HTMLDivElement>(null);

  const urlId = useId();
  const consentId = useId();
  const noteId = useId();

  const running = state.status === "running";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (running) return;

    setState({ status: "running" });
    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, consent }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" && payload !== null && "error" in payload
            ? String((payload as { error: unknown }).error)
            : "The scan did not come back. Try again in a minute.";
        setState({ status: "error", message });
        return;
      }

      setState({ status: "done", report: payload as ScanReport });
      resultsRef.current?.focus();
    } catch {
      setState({
        status: "error",
        message: "Quietword could not reach its own server. Check your connection and try again.",
      });
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="border border-line bg-surface p-6 sm:p-8">
        <label htmlFor={urlId} className="block font-medium">
          Your app&rsquo;s address
        </label>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <input
            id={urlId}
            name="url"
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="myapp.com"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            aria-describedby={noteId}
            disabled={running}
            className="w-full border border-line bg-paper px-4 py-3 font-mono text-base text-ink caret-forest placeholder:text-unknown focus-visible:border-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed disabled:border-line disabled:bg-line/40 disabled:text-unknown"
          />
          <button
            type="submit"
            disabled={running || !consent || url.trim().length === 0}
            className="shrink-0 bg-forest px-6 py-3 font-medium text-paper transition-colors hover:bg-forest-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber active:bg-forest-deep disabled:cursor-not-allowed disabled:bg-unknown"
          >
            {running ? "Checking" : "Run the five checks"}
          </button>
        </div>

        <div className="mt-5 flex items-start gap-3">
          <input
            id={consentId}
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            disabled={running}
            className="mt-3 size-5 shrink-0 accent-[#1b4d3e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber disabled:cursor-not-allowed"
          />
          <label
            htmlFor={consentId}
            className="flex min-h-11 cursor-pointer items-center text-[0.9375rem] leading-relaxed text-muted"
          >
            I own this app, or I have permission from the person who does to test it.
          </label>
        </div>

        <p id={noteId} className="mt-4 border-t border-line pt-4 text-sm text-muted">
          Quietword sends about thirty requests from its own server, over roughly twenty seconds. It
          never signs in, never sends anything designed to break your app, and refuses any address on
          a private network.
        </p>
      </form>

      <div
        ref={resultsRef}
        tabIndex={-1}
        aria-live="polite"
        aria-busy={running}
        className="focus-visible:outline-none"
      >
        {running && (
          <div className="mt-8">
            <p className="font-mono text-sm text-muted">
              Running the five checks. This takes up to twenty five seconds.
            </p>
            <div
              className="scan-progress relative mt-3 h-[3px] overflow-hidden bg-wash"
              role="presentation"
            />
          </div>
        )}

        {state.status === "error" && (
          <p className="mt-8 border-l-2 border-clay bg-surface p-4 text-[0.9375rem]">
            {state.message}
          </p>
        )}

        {state.status === "done" && <Report report={state.report} />}
      </div>
    </div>
  );
}
