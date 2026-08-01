import type { ClipEnvelope, SearchRequest } from '@cliptown/interfaces';
import { validateClipEnvelope } from '@cliptown/interfaces';

/**
 * A non-2xx response.
 *
 * The message carries only the status and the request path. It deliberately
 * omits the response body: this error propagates into host application logs
 * and crash reports — MemeBank embeds this client — and a server error body
 * can contain a token, an email, or clip metadata that must not be duplicated
 * there. Callers that genuinely need the body should read it from `response`.
 */
export class CliptownApiError extends Error {
  constructor(readonly status: number, readonly path: string) {
    super(`ClipTown API ${status} for ${path}`);
    this.name = 'CliptownApiError';
  }
}

export interface AccessTokenProvider { accessToken(): Promise<string> }
export interface ClipPage { items: ClipEnvelope[]; next_cursor: string | null }
export interface PushRequest { mutations: ClipEnvelope[]; cursor?: string | null }
export interface PushResponse { accepted: string[]; cursor: string | null }
export interface PullRequest { cursor?: string | null; limit?: number }
export interface PullResponse { mutations: ClipEnvelope[]; cursor: string | null; has_more: boolean }

export class CliptownClient {
  readonly #endpoint: string;
  readonly #tokens: AccessTokenProvider;
  readonly #fetch: typeof fetch;

  constructor(options: { endpoint: string; tokenProvider: AccessTokenProvider; fetchImpl?: typeof fetch }) {
    this.#endpoint = options.endpoint.replace(/\/$/, '');
    if (!this.#endpoint.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(this.#endpoint)) {
      throw new Error('ClipTown endpoint must use HTTPS outside localhost');
    }
    this.#tokens = options.tokenProvider;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.#tokens.accessToken();
    const response = await this.#fetch(`${this.#endpoint}${path}`, {
      ...init,
      headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...init.headers },
    });
    if (!response.ok) throw new CliptownApiError(response.status, path);
    return response.status === 204 ? undefined as T : await response.json() as T;
  }

  listClips(cursor?: string, limit = 100): Promise<ClipPage> {
    assertLimit(limit, 500);
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    return this.#request(`/v1/clips?${query}`);
  }

  putClip(clip: ClipEnvelope, idempotencyKey = crypto.randomUUID()): Promise<ClipEnvelope> {
    validateClipEnvelope(clip);
    assertIdempotencyKey(idempotencyKey);
    return this.#request(`/v1/clips/${clip.clip_id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(clip),
    });
  }

  deleteClip(clipId: string): Promise<void> {
    return this.#request(`/v1/clips/${encodeURIComponent(clipId)}`, { method: 'DELETE' });
  }

  search(request: SearchRequest): Promise<ClipPage> {
    if (request.limit != null) assertLimit(request.limit, 100);
    if (request.privacy_mode === 'local_only' && ((request.blind_terms?.length ?? 0) > 0 || request.query_embedding != null)) {
      throw new Error('local_only search cannot send search artifacts');
    }
    if (request.privacy_mode === 'opt_in_vector' && request.query_embedding?.length !== 1536) {
      throw new Error('opt_in_vector search requires exactly 1536 embedding values');
    }
    return this.#request('/v1/search', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
  }

  push(request: PushRequest): Promise<PushResponse> {
    if (request.mutations.length > 500) throw new Error('a sync push may contain at most 500 mutations');
    request.mutations.forEach(validateClipEnvelope);
    return this.#request('/v1/sync/push', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
  }

  pull(request: PullRequest = {}): Promise<PullResponse> {
    if (request.limit != null) assertLimit(request.limit, 500);
    return this.#request('/v1/sync/pull', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
    });
  }
}

function assertIdempotencyKey(value: string): void {
  if (value.length < 16 || value.length > 128) {
    throw new Error('idempotency key must contain from 16 through 128 characters');
  }
}

function assertLimit(limit: number, maximum: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new Error(`limit must be an integer from 1 through ${maximum}`);
  }
}
