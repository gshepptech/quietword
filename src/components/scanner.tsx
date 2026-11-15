"use client";

import { useId, useRef, useState } from "react";

import { Report } from "@/components/report";
import type { ScanReport } from "@/lib/scanner/types";

type State =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; report: ScanReport }
  // Every message shown in this state comes from the server and names what
  // failed and what to do next. The only local fallback is in onSubmit.
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
      <form onSubmit={onSubmit} className="panel panel-raised overflow-hidden">
        <div className="bg-inset px-5 py-3 sm:px-6">
          <label htmlFor={urlId} className="meta">
            Target address
          </label>
        </div>
        <div className="px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row">
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
            className="w-full rounded-[--radius-inset] bg-inset px-4 py-3 font-mono text-[0.9375rem] text-ink caret-signal shadow-[inset_0_1px_2px_rgba(16,21,27,0.07)] placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:text-faint"
          />
          <button
            type="submit"
            disabled={running || !consent || url.trim().length === 0}
            className="shrink-0 rounded-[--radius-inset] bg-ink px-6 py-3 text-[0.875rem] font-medium text-surface shadow-[0_1px_2px_rgba(16,21,27,0.3)] transition-colors hover:bg-signal-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:bg-faint disabled:shadow-none"
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
            className="mt-2.5 size-4 shrink-0 accent-[#10151b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed"
          />
          <label
            htmlFor={consentId}
            className="flex min-h-11 cursor-pointer items-center text-[0.875rem] leading-relaxed text-muted"
          >
            I own this app, or I have permission from the person who does to test it.
          </label>
        </div>

        <p id={noteId} className="mt-6 border-t border-line pt-4 text-[0.8125rem] text-muted">
          Quietword sends about thirty requests from its own server, over roughly twenty seconds. It
          never signs in, never sends anything designed to break your app, and refuses any address on
          a private network.
        </p>
        </div>
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
            <p className="meta">Running five checks · up to 25s</p>
            <div
              className="scan-progress relative mt-3 h-1.5 overflow-hidden rounded-full bg-ground-deep"
              role="presentation"
            />
          </div>
        )}

        {state.status === "error" && (
          <p className="panel mt-8 border-l-2 border-l-signal p-4 text-[0.875rem]">
            {state.message}
          </p>
        )}

        {state.status === "done" && <Report report={state.report} />}
      </div>
    </div>
  );
}
