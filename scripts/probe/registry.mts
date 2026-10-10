/**
 * Shared probe registry types. Each marketplace module under `probes/` exports
 * one `ProbeSet` describing how to build a client from the environment and the
 * read-only calls to make against it.
 */
import { isLoncaError } from '@lonca/core';
import type { WireExchange, WireRecorder } from '@lonca/drift';
import { summarize, type Shape, type SummarizeOptions } from './shape.mts';

export type Marketplace = 'hepsiburada' | 'n11' | 'trendyol';

export interface Probe<TClient> {
  /** Stable identifier, e.g. `orders.list`. Doubles as the snapshot key. */
  name: string;
  /** Read-only call. Must never hit a mutating endpoint. */
  call: (client: TClient) => Promise<unknown>;
}

export interface ProbeSet<TClient> {
  marketplace: Marketplace;
  /** Environment variable names that must all be present for the set to run. */
  requiredEnv: readonly string[];
  /** Human label of the targeted environment (`sit`, `stage`, `prod`). */
  envLabel: () => string;
  /** Build a client whose HTTP traffic goes through `fetch` (the runner's wire recorder). */
  createClient: (fetch: typeof globalThis.fetch) => TClient;
  probes: readonly Probe<TClient>[];
}

export type ProbeStatus = 'ok' | 'error' | 'skipped';

/** What one probe produced. Only structural / diagnostic fields — never a body. */
export interface ProbeResult {
  marketplace: Marketplace;
  name: string;
  status: ProbeStatus;
  httpStatus?: number;
  errorName?: string;
  errorCode?: string;
  durationMs: number;
  /** Shape of the SDK's (normalised) return value. */
  shape?: Shape;
  /** The HTTP exchanges the probe caused, as seen on the wire (see `@lonca/drift` `createWireRecorder`). */
  wire?: WireExchange[];
}

export function hasCredentials(set: ProbeSet<unknown>): boolean {
  return set.requiredEnv.every((name) => Boolean(process.env[name]));
}

export function skippedResult(set: ProbeSet<unknown>, probe: Probe<unknown>): ProbeResult {
  return { marketplace: set.marketplace, name: probe.name, status: 'skipped', durationMs: 0 };
}

/**
 * Run one probe and reduce whatever comes back to a `ProbeResult`.
 *
 * SDK-level errors are recorded as `{ errorName, errorCode, httpStatus }` only.
 * The error message and any attached response data are dropped on purpose —
 * marketplaces echo request parameters (and sometimes PII) in error bodies.
 *
 * When `recorder` is given (the client was built over `recorder.fetch`), the
 * wire exchanges the call caused are attached as `wire` — for errors too, so
 * a failing probe still shows which operation and status it hit.
 */
export async function runProbe<TClient>(
  set: ProbeSet<TClient>,
  probe: Probe<TClient>,
  client: TClient,
  shapeOptions: SummarizeOptions,
  recorder?: WireRecorder,
): Promise<ProbeResult> {
  // Drop anything recorded outside a probe (none expected) so it is not attributed here.
  await recorder?.take();
  const result = await callProbe(set, probe, client, shapeOptions);
  if (recorder) result.wire = await recorder.take();
  return result;
}

async function callProbe<TClient>(
  set: ProbeSet<TClient>,
  probe: Probe<TClient>,
  client: TClient,
  shapeOptions: SummarizeOptions,
): Promise<ProbeResult> {
  const started = performance.now();
  try {
    const value = await probe.call(client);
    return {
      marketplace: set.marketplace,
      name: probe.name,
      status: 'ok',
      durationMs: Math.round(performance.now() - started),
      shape: summarize(value, shapeOptions),
    };
  } catch (err) {
    const durationMs = Math.round(performance.now() - started);
    if (isLoncaError(err)) {
      return {
        marketplace: set.marketplace,
        name: probe.name,
        status: 'error',
        httpStatus: err.status,
        errorName: err.name,
        errorCode: err.code,
        durationMs,
      };
    }
    return {
      marketplace: set.marketplace,
      name: probe.name,
      status: 'error',
      errorName: err instanceof Error ? err.name : 'UnknownError',
      durationMs,
    };
  }
}
