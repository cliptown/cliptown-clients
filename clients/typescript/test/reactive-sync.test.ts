import assert from 'node:assert/strict';
import test from 'node:test';

import { lastValueFrom, toArray } from 'rxjs';

import { CliptownContractError, type PullRequest, type PullResponse } from '../src/client.js';
import {
  observeSyncPull,
  reduceSyncSnapshot,
  syncRetryDelayMs,
  type SyncPullOptions,
  type SyncPullPort,
  type SyncSnapshot,
} from '../src/reactive-sync.js';

const page = (
  cursor: string | null,
  hasMore: boolean,
): PullResponse => ({ mutations: [], cursor, has_more: hasMore });

test('pure reducer rejects impossible lifecycle transitions', () => {
  const idle: SyncSnapshot = Object.freeze({ phase: 'idle', cursor: null });

  assert.throws(
    () => reduceSyncSnapshot(idle, Object.freeze({ type: 'completed' })),
    CliptownContractError,
  );
  assert.deepEqual(idle, { phase: 'idle', cursor: null });
});

test('deterministic backoff is bounded by the explicit policy', () => {
  const policy = { maxRetries: 4, initialDelayMs: 50, maximumDelayMs: 120 };

  assert.deepEqual(
    [1, 2, 3, 4].map((attempt) => syncRetryDelayMs(policy, attempt)),
    [50, 100, 120, 120],
  );
});

test('RxJS pull paginates, advances the cursor, and completes', async () => {
  const seen: PullRequest[] = [];
  const port: SyncPullPort = {
    async pull(request = {}): Promise<PullResponse> {
      seen.push({ ...request });
      return request.cursor === undefined
        ? page('server-sequence:1', true)
        : page('server-sequence:2', false);
    },
  };

  const snapshots = await lastValueFrom(
    observeSyncPull(port, {}, { maxRetries: 0, initialDelayMs: 0, maximumDelayMs: 0 }).pipe(
      toArray(),
    ),
  );

  assert.deepEqual(
    snapshots.map((snapshot) => snapshot.phase),
    ['idle', 'pulling', 'pulling', 'pulling', 'completed'],
  );
  assert.deepEqual(seen, [{}, { cursor: 'server-sequence:1' }]);
  assert.deepEqual(snapshots.at(-1), {
    phase: 'completed',
    cursor: 'server-sequence:2',
    receivedPages: 2,
    receivedMutations: 0,
  });
});

test('concurrent subscribers share one network execution', async () => {
  let calls = 0;
  const port: SyncPullPort = {
    async pull(): Promise<PullResponse> {
      calls += 1;
      await Promise.resolve();
      return page('server-sequence:1', false);
    },
  };
  const stream = observeSyncPull(port, {}, {
    maxRetries: 0,
    initialDelayMs: 0,
    maximumDelayMs: 0,
  });

  const [left, right] = await Promise.all([
    lastValueFrom(stream.pipe(toArray())),
    lastValueFrom(stream.pipe(toArray())),
  ]);

  assert.equal(calls, 1);
  // A late concurrent subscriber receives the current replayed snapshot, not
  // the complete earlier history, and then shares the same live execution.
  assert.deepEqual(left.at(-1), right.at(-1));
  assert.equal(left.at(-1)?.phase, 'completed');
});

test('retry is scoped to a failing page and never replays accepted pages', async () => {
  const seen: Array<string | null> = [];
  let secondPageAttempts = 0;
  const port: SyncPullPort = {
    async pull(request = {}): Promise<PullResponse> {
      const cursor = request.cursor ?? null;
      seen.push(cursor);
      if (cursor === null) return page('server-sequence:1', true);
      secondPageAttempts += 1;
      if (secondPageAttempts === 1) throw new Error('temporary outage');
      return page('server-sequence:2', false);
    },
  };

  const snapshots = await lastValueFrom(
    observeSyncPull(port, {}, { maxRetries: 1, initialDelayMs: 0, maximumDelayMs: 0 }).pipe(
      toArray(),
    ),
  );

  assert.deepEqual(seen, [null, 'server-sequence:1', 'server-sequence:1']);
  assert.deepEqual(snapshots.at(-1), {
    phase: 'completed',
    cursor: 'server-sequence:2',
    receivedPages: 2,
    receivedMutations: 0,
  });
});

test('last unsubscribe aborts the active pull effect', async () => {
  let signal: AbortSignal | undefined;
  const port: SyncPullPort = {
    pull(
      _request?: Readonly<PullRequest>,
      options?: Readonly<SyncPullOptions>,
    ): Promise<PullResponse> {
      signal = options?.signal;
      return new Promise(() => {});
    },
  };

  const subscription = observeSyncPull(port).subscribe();
  await Promise.resolve();
  assert.equal(signal?.aborted, false);

  subscription.unsubscribe();
  assert.equal(signal?.aborted, true);
});

test('protocol failures are typed and never expose exception messages', async () => {
  const secret = 'clipboard-secret-that-must-not-escape';
  const port: SyncPullPort = {
    async pull(): Promise<PullResponse> {
      throw new Error(secret);
    },
  };

  const snapshots = await lastValueFrom(
    observeSyncPull(port, {}, { maxRetries: 0, initialDelayMs: 0, maximumDelayMs: 0 }).pipe(
      toArray(),
    ),
  );
  const failed = snapshots.at(-1);

  assert.deepEqual(failed, {
    phase: 'failed',
    cursor: null,
    receivedPages: 0,
    receivedMutations: 0,
    failure: { kind: 'transport' },
  });
  assert.equal(JSON.stringify(failed).includes(secret), false);
});

test('has-more without cursor progress fails closed', async () => {
  const port: SyncPullPort = {
    async pull(): Promise<PullResponse> {
      return page(null, true);
    },
  };

  const snapshots = await lastValueFrom(
    observeSyncPull(port, {}, { maxRetries: 0, initialDelayMs: 0, maximumDelayMs: 0 }).pipe(
      toArray(),
    ),
  );

  const final = snapshots.at(-1);
  assert.equal(final?.phase, 'failed');
  if (final?.phase === 'failed') {
    assert.deepEqual(final.failure, { kind: 'contract' });
  }
});

test('multi-page cursor cycles fail before refetching an accepted page', async () => {
  const seen: Array<string | null> = [];
  const port: SyncPullPort = {
    async pull(request = {}): Promise<PullResponse> {
      const cursor = request.cursor ?? null;
      seen.push(cursor);
      if (cursor === null) return page('A', true);
      if (cursor === 'A') return page('B', true);
      if (cursor === 'B') return page('A', true);
      throw new Error('unexpected cursor');
    },
  };

  const snapshots = await lastValueFrom(
    observeSyncPull(port, {}, { maxRetries: 0, initialDelayMs: 0, maximumDelayMs: 0 }).pipe(
      toArray(),
    ),
  );

  // The third accepted page points back to A. Reject that cycle before a
  // fourth request can re-pull A and replay already accepted pagination work.
  assert.deepEqual(seen, [null, 'A', 'B']);
  assert.deepEqual(snapshots.at(-1), {
    phase: 'failed',
    cursor: 'A',
    receivedPages: 3,
    receivedMutations: 0,
    failure: { kind: 'contract' },
  });
});
