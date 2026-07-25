import type { Agent } from "undici";

import {
  probe,
  type Probe,
  type ProbeFailure,
  type ProbeOptions,
  type ProbeResponse,
  type ScanBudget,
} from "./net";

export interface CollectedAsset {
  url: string;
  body: string;
  truncated: boolean;
}

export interface Collected {
  /** The root HTML response, or null when the site never answered. */
  page: ProbeResponse | null;
  /** Why the page could not be read, when it could not. */
  pageError: string | null;
  scripts: CollectedAsset[];
  /** Inline scripts and fetched bundles, joined. What the secrets check reads. */
  bundleText: string;
  /** `/api/...` paths the frontend itself references. */
  apiPaths: string[];
}

export interface ScanContext {
  target: URL;
  origin: string;
  budget: ScanBudget;
  dispatcher: Agent;
  /** Every successful response the scan has seen, kept for the error check. */
  captured: ProbeResponse[];
  /** Every request that did not come back, kept so the scan can explain itself. */
  failures: ProbeFailure[];
  collected: Collected;
  visit(url: string, options?: ProbeOptions): Promise<Probe>;
}

export function createContext(target: URL, budget: ScanBudget, dispatcher: Agent): ScanContext {
  const captured: ProbeResponse[] = [];
  const failures: ProbeFailure[] = [];

  return {
    target,
    origin: target.origin,
    budget,
    dispatcher,
    captured,
    failures,
    collected: { page: null, pageError: null, scripts: [], bundleText: "", apiPaths: [] },
    async visit(url: string, options?: ProbeOptions): Promise<Probe> {
      const result = await probe(dispatcher, url, budget, options);
      if (result.ok) captured.push(result);
      else failures.push(result);
      return result;
    },
  };
}
