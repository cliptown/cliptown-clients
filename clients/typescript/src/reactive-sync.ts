import { validateClipEnvelope } from '@cliptown/interfaces';
import {
  EMPTY,
  Observable,
  catchError,
  concat,
  defer,
  distinctUntilChanged,
  endWith,
  expand,
  map,
  of,
  retry,
  scan,
  shareReplay,
  startWith,
  timer,
  type SchedulerLike,
} from 'rxjs';

import {
  CliptownApiError,
  CliptownContractError,
  CliptownHttpError,
  type PullRequest,
  type PullResponse,
} from './client.js';

export interface SyncPullOptions {
  readonly signal?: AbortSignal;
}

/** The narrow effect port required by the reactive functional core. */
export interface SyncPullPort {
  pull(
    request?: Readonly<PullRequest>,
    options?: Readonly<SyncPullOptions>,
  ): Promise<PullResponse>;
}

export interface SyncRetryPolicy {
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  readonly maximumDelayMs: number;
}

export const defaultSyncRetryPolicy: Readonly<SyncRetryPolicy> = Object.freeze({
  maxRetries: 3,
  initialDelayMs: 250,
  maximumDelayMs: 4_000,
});

export interface ReadonlyPullResponse {
  readonly mutations: readonly PullResponse['mutations'][number][];
  readonly cursor: string | null;
  readonly has_more: boolean;
}

export type SyncFailure =
  | Readonly<{
      kind: 'http';
      status: number;
      path: string;
      code?: string;
    }>
  | Readonly<{ kind: 'contract' }>
  | Readonly<{ kind: 'transport' }>;

export type SyncPullEvent =
  | Readonly<{ type: 'started'; cursor: string | null }>
  | Readonly<{ type: 'page_received'; page: ReadonlyPullResponse }>
  | Readonly<{ type: 'completed' }>
  | Readonly<{ type: 'failed'; failure: SyncFailure }>;

export type SyncSnapshot =
  | Readonly<{ phase: 'idle'; cursor: string | null }>
  | Readonly<{
      phase: 'pulling';
      cursor: string | null;
      receivedPages: number;
      receivedMutations: number;
      latestPage: ReadonlyPullResponse | null;
    }>
  | Readonly<{
      phase: 'completed';
      cursor: string | null;
      receivedPages: number;
      receivedMutations: number;
    }>
  | Readonly<{
      phase: 'failed';
      cursor: string | null;
      receivedPages: number;
      receivedMutations: number;
      failure: SyncFailure;
    }>;

interface PulledPage {
  readonly requestedCursor: string | null;
  readonly page: ReadonlyPullResponse;
}

/** Pure, deterministic exponential backoff without hidden random state. */
export function syncRetryDelayMs(
  policy: Readonly<SyncRetryPolicy>,
  retryNumber: number,
): number {
  validateRetryPolicy(policy);
  if (!Number.isSafeInteger(retryNumber) || retryNumber < 1) {
    throw new CliptownContractError('retry number must be a positive integer');
  }
  return Math.min(
    policy.maximumDelayMs,
    policy.initialDelayMs * 2 ** (retryNumber - 1),
  );
}

/** Total state transition function; effects are deliberately absent. */
export function reduceSyncSnapshot(
  state: SyncSnapshot,
  event: SyncPullEvent,
): SyncSnapshot {
  switch (event.type) {
    case 'started':
      if (state.phase !== 'idle') return invalidTransition(state, event);
      return Object.freeze({
        phase: 'pulling',
        cursor: event.cursor,
        receivedPages: 0,
        receivedMutations: 0,
        latestPage: null,
      });
    case 'page_received':
      if (state.phase !== 'pulling') return invalidTransition(state, event);
      return Object.freeze({
        phase: 'pulling',
        cursor: event.page.cursor,
        receivedPages: state.receivedPages + 1,
        receivedMutations:
          state.receivedMutations + event.page.mutations.length,
        latestPage: event.page,
      });
    case 'completed':
      if (state.phase !== 'pulling') return invalidTransition(state, event);
      return Object.freeze({
        phase: 'completed',
        cursor: state.cursor,
        receivedPages: state.receivedPages,
        receivedMutations: state.receivedMutations,
      });
    case 'failed':
      if (state.phase !== 'pulling') return invalidTransition(state, event);
      return Object.freeze({
        phase: 'failed',
        cursor: state.cursor,
        receivedPages: state.receivedPages,
        receivedMutations: state.receivedMutations,
        failure: event.failure,
      });
    default:
      return assertNever(event);
  }
}

/**
 * Pulls every available sync page as one replaying RxJS state stream.
 *
 * The returned observable is cold until its first subscriber, shares exactly
 * one effect execution between concurrent subscribers, aborts the active HTTP
 * request when its last subscriber unsubscribes, and exposes failures only as
 * bounded typed data. It never logs plaintext; replay is bounded to the latest
 * encrypted page snapshot.
 */
export function observeSyncPull(
  port: SyncPullPort,
  request: Readonly<PullRequest> = Object.freeze({}),
  retryPolicy: Readonly<SyncRetryPolicy> = defaultSyncRetryPolicy,
  scheduler?: SchedulerLike,
): Observable<SyncSnapshot> {
  validatePullRequest(request);
  validateRetryPolicy(retryPolicy);
  const initialCursor = request.cursor ?? null;
  const initial: SyncSnapshot = Object.freeze({
    phase: 'idle',
    cursor: initialCursor,
  });

  const pages = defer(() => {
    // Cursor history belongs to one source execution. Keeping it inside defer
    // makes a refCount teardown followed by a new cold execution start with a
    // fresh history instead of inheriting state from the previous subscriber.
    const requestedCursors = new Set<string | null>([initialCursor]);
    const guardedPull = (cursor: string | null): Observable<PulledPage> =>
      pullPage(port, request, cursor, retryPolicy, scheduler).pipe(
        map((current) => {
          if (!current.page.has_more) return current;
          const nextCursor = current.page.cursor;
          if (nextCursor === null || requestedCursors.has(nextCursor)) {
            throw new CliptownContractError(
              'sync cursor must advance while more pages are available',
            );
          }
          requestedCursors.add(nextCursor);
          return current;
        }),
      );

    return guardedPull(initialCursor).pipe(
      expand((current) =>
        current.page.has_more ? guardedPull(current.page.cursor) : EMPTY,
      ),
    );
  });

  const events = concat(
    of<SyncPullEvent>(Object.freeze({ type: 'started', cursor: initialCursor })),
    pages.pipe(
      map(
        ({ page }): SyncPullEvent =>
          Object.freeze({ type: 'page_received', page }),
      ),
      endWith<SyncPullEvent>(Object.freeze({ type: 'completed' })),
      catchError((error: unknown) =>
        of<SyncPullEvent>(
          Object.freeze({ type: 'failed', failure: classifySyncFailure(error) }),
        ),
      ),
    ),
  );

  return events.pipe(
    scan(reduceSyncSnapshot, initial),
    startWith(initial),
    distinctUntilChanged(syncSnapshotsEqual),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
}

function pullPage(
  port: SyncPullPort,
  base: Readonly<PullRequest>,
  cursor: string | null,
  retryPolicy: Readonly<SyncRetryPolicy>,
  scheduler?: SchedulerLike,
): Observable<PulledPage> {
  return new Observable<PulledPage>((subscriber) => {
    const controller = new AbortController();
    const request = requestAtCursor(base, cursor);

    void port
      .pull(request, Object.freeze({ signal: controller.signal }))
      .then((response) => {
        if (subscriber.closed) return;
        subscriber.next(
          Object.freeze({
            requestedCursor: cursor,
            page: normalizePullResponse(response),
          }),
        );
        subscriber.complete();
      })
      .catch((error: unknown) => {
        if (!subscriber.closed) subscriber.error(error);
      });

    return () => controller.abort();
  }).pipe(
    // Retry the failing page, not the whole expanded stream. Retrying outside
    // this boundary would re-emit already accepted pages and double-count
    // mutations after a later-page transport failure.
    retry({
      count: retryPolicy.maxRetries,
      delay: (_error, retryNumber) =>
        timer(syncRetryDelayMs(retryPolicy, retryNumber), scheduler),
    }),
  );
}

function requestAtCursor(
  base: Readonly<PullRequest>,
  cursor: string | null,
): PullRequest {
  const withLimit = base.limit === undefined ? {} : { limit: base.limit };
  const withCursor = cursor === null ? {} : { cursor };
  return Object.freeze({ ...withLimit, ...withCursor });
}

function normalizePullResponse(response: PullResponse): ReadonlyPullResponse {
  if (!Array.isArray(response.mutations) || response.mutations.length > 500) {
    throw new CliptownContractError('invalid sync mutation page');
  }
  response.mutations.forEach(validateClipEnvelope);
  if (
    typeof response.has_more !== 'boolean' ||
    (response.cursor !== null &&
      (typeof response.cursor !== 'string' ||
        response.cursor.length === 0 ||
        response.cursor.length > 512 ||
        /[\r\n]/.test(response.cursor))) ||
    (response.has_more && response.cursor === null)
  ) {
    throw new CliptownContractError('invalid sync page cursor');
  }
  return Object.freeze({
    mutations: Object.freeze([...response.mutations]),
    cursor: response.cursor,
    has_more: response.has_more,
  });
}

function classifySyncFailure(error: unknown): SyncFailure {
  if (error instanceof CliptownHttpError && error.code !== undefined) {
    return Object.freeze({
      kind: 'http',
      status: error.status,
      path: error.path,
      code: error.code,
    });
  }
  if (error instanceof CliptownApiError) {
    return Object.freeze({
      kind: 'http',
      status: error.status,
      path: error.path,
    });
  }
  if (error instanceof CliptownContractError) {
    return Object.freeze({ kind: 'contract' });
  }
  return Object.freeze({ kind: 'transport' });
}

function validatePullRequest(request: Readonly<PullRequest>): void {
  if (
    request.limit !== undefined &&
    (!Number.isSafeInteger(request.limit) || request.limit < 1 || request.limit > 500)
  ) {
    throw new CliptownContractError('sync pull limit must be from 1 through 500');
  }
  if (
    request.cursor !== undefined &&
    request.cursor !== null &&
    (request.cursor.length === 0 ||
      request.cursor.length > 512 ||
      /[\r\n]/.test(request.cursor))
  ) {
    throw new CliptownContractError('invalid sync pull cursor');
  }
}

function validateRetryPolicy(policy: Readonly<SyncRetryPolicy>): void {
  if (
    !Number.isSafeInteger(policy.maxRetries) ||
    policy.maxRetries < 0 ||
    policy.maxRetries > 10 ||
    !Number.isSafeInteger(policy.initialDelayMs) ||
    policy.initialDelayMs < 0 ||
    !Number.isSafeInteger(policy.maximumDelayMs) ||
    policy.maximumDelayMs < policy.initialDelayMs ||
    policy.maximumDelayMs > 60_000
  ) {
    throw new CliptownContractError('invalid sync retry policy');
  }
}

function invalidTransition(
  state: SyncSnapshot,
  event: SyncPullEvent,
): never {
  throw new CliptownContractError(
    `invalid reactive sync transition: ${state.phase} + ${event.type}`,
  );
}

function assertNever(value: never): never {
  throw new CliptownContractError(
    `unsupported reactive sync event: ${String(value)}`,
  );
}

function syncSnapshotsEqual(left: SyncSnapshot, right: SyncSnapshot): boolean {
  if (left.phase !== right.phase || left.cursor !== right.cursor) return false;
  if (left.phase === 'idle' || right.phase === 'idle') return true;
  if (
    left.receivedPages !== right.receivedPages ||
    left.receivedMutations !== right.receivedMutations
  ) {
    return false;
  }
  if (left.phase === 'pulling' && right.phase === 'pulling') {
    return left.latestPage === right.latestPage;
  }
  if (left.phase === 'failed' && right.phase === 'failed') {
    return syncFailuresEqual(left.failure, right.failure);
  }
  return true;
}

function syncFailuresEqual(left: SyncFailure, right: SyncFailure): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case 'contract':
    case 'transport':
      return true;
    case 'http':
      return (
        right.kind === 'http' &&
        left.status === right.status &&
        left.path === right.path &&
        left.code === right.code
      );
    default:
      return assertNever(left);
  }
}
