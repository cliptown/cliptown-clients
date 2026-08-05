import type { ClipEnvelope, SearchRequest } from '@cliptown/interfaces';
import { validateClipEnvelope } from '@cliptown/interfaces';

export interface AccessTokenProvider { accessToken(): Promise<string> }
export interface ClipPage { items: ClipEnvelope[]; next_cursor: string | null }
export interface PushRequest { mutations: ClipEnvelope[]; cursor?: string | null }
export interface PushResponse { accepted: string[]; cursor: string | null }
export interface PullRequest { cursor?: string | null; limit?: number }
export interface PullResponse { mutations: ClipEnvelope[]; cursor: string | null; has_more: boolean }

export type MemeBankTransferDirection =
  | 'memebank_to_cliptown'
  | 'cliptown_to_memebank';

export type MemeBankTransferState =
  | 'pending'
  | 'acknowledged'
  | 'ignored'
  | 'rejected'
  | 'expired'
  | 'cancelled';

export type MemeBankAcknowledgementDisposition =
  | 'acknowledged'
  | 'ignored'
  | 'rejected';

export interface MemeBankCipherEnvelope {
  algorithm: 'xchacha20poly1305-v1' | 'aes-256-gcm-v1';
  nonce: string;
  ciphertext: string;
  associated_data_hash?: string | null;
  key_id: string;
}

export interface CreateMemeBankTransferRequest {
  contract_version: 1;
  direction: MemeBankTransferDirection;
  source_item_id: string;
  media_type: string;
  content_sha256: string;
  content_length: number;
  payload: MemeBankCipherEnvelope;
  encrypted_metadata?: MemeBankCipherEnvelope | null;
  expires_at: string;
}

export interface MemeBankTransfer extends CreateMemeBankTransferRequest {
  transfer_id: string;
  state: MemeBankTransferState;
  created_at: string;
  updated_at: string;
  acknowledged_at?: string | null;
}

export interface MemeBankTransferPage {
  items: MemeBankTransfer[];
  next_cursor: string | null;
}

export interface ListMemeBankTransfersOptions {
  cursor?: string;
  limit?: number;
  direction?: MemeBankTransferDirection;
  state?: MemeBankTransferState;
}

export interface AcknowledgeMemeBankTransferRequest {
  contract_version: 1;
  disposition: MemeBankAcknowledgementDisposition;
  client_receipt_id: string;
}

export class CliptownHttpError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, code?: string) {
    super(code ? `ClipTown API ${status} (${code})` : `ClipTown API ${status}`);
    this.name = 'CliptownHttpError';
    this.status = status;
    this.code = code;
  }
}

export class CliptownContractError extends Error {
  constructor(message: string) {
    super(`ClipTown contract: ${message}`);
    this.name = 'CliptownContractError';
  }
}

const MAX_BEARER_LENGTH = 16 * 1024;
const MAX_SUCCESS_BODY_LENGTH = 24 * 1024 * 1024;
const MAX_ERROR_BODY_LENGTH = 64 * 1024;
const MAX_INLINE_CIPHERTEXT_LENGTH = 22_369_624;
const MAX_SOURCE_CONTENT_LENGTH = 16 * 1024 * 1024;
const PORTABLE_IDENTIFIER = /^[A-Za-z0-9._:-]+$/;
const CANONICAL_UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SHA256_BASE64URL = /^[A-Za-z0-9_-]{43}=?$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export class CliptownClient {
  readonly #endpoint: string;
  readonly #tokens: AccessTokenProvider;
  readonly #fetch: typeof fetch;

  constructor(options: { endpoint: string; tokenProvider: AccessTokenProvider; fetchImpl?: typeof fetch }) {
    this.#endpoint = options.endpoint.replace(/\/$/, '');
    if (!this.#endpoint.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(this.#endpoint)) {
      throw new Error('ClipTown endpoint must use HTTPS outside localhost');
    }
    this.#tokens = options.tokenProvider;
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await this.#tokens.accessToken();
    assertBearer(token);
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${token}`);
    const response = await this.#fetch(`${this.#endpoint}${path}`, {
      ...init,
      headers,
      redirect: 'error',
    });

    const declaredLength = Number(response.headers.get('content-length'));
    const maximumLength = response.ok
      ? MAX_SUCCESS_BODY_LENGTH
      : MAX_ERROR_BODY_LENGTH;
    if (Number.isFinite(declaredLength) && declaredLength > maximumLength) {
      throw new CliptownContractError('response exceeds the configured size limit');
    }

    if (response.status === 204) return undefined as T;
    const body = await response.text();
    if (body.length > maximumLength) {
      throw new CliptownContractError('response exceeds the configured size limit');
    }
    if (!response.ok) {
      throw new CliptownHttpError(response.status, safeErrorCode(body));
    }
    if (body.length === 0) {
      throw new CliptownContractError('empty JSON response');
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new CliptownContractError('invalid JSON response');
    }
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
    return this.#request(`/v1/clips/${encodeURIComponent(clip.clip_id)}`, {
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

  async createMemeBankTransfer(
    idempotencyKey: string,
    request: CreateMemeBankTransferRequest,
  ): Promise<MemeBankTransfer> {
    assertIdempotencyKey(idempotencyKey);
    assertCreateMemeBankTransfer(request);
    const transfer = await this.#request<MemeBankTransfer>(
      '/v1/integrations/memebank/transfers',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(request),
      },
    );
    assertMemeBankTransfer(transfer);
    return transfer;
  }

  async listMemeBankTransfers(
    options: ListMemeBankTransfersOptions = {},
  ): Promise<MemeBankTransferPage> {
    const query = new URLSearchParams();
    const limit = options.limit ?? 50;
    assertLimit(limit, 100);
    query.set('limit', String(limit));
    if (options.cursor !== undefined) {
      assertCursor(options.cursor);
      query.set('cursor', options.cursor);
    }
    if (options.direction !== undefined) {
      assertMemeBankDirection(options.direction);
      query.set('direction', options.direction);
    }
    if (options.state !== undefined) {
      assertMemeBankState(options.state);
      query.set('state', options.state);
    }
    const page = await this.#request<MemeBankTransferPage>(
      `/v1/integrations/memebank/transfers?${query}`,
    );
    if (!Array.isArray(page.items) || page.items.length > 100) {
      throw new CliptownContractError('invalid MemeBank transfer page');
    }
    page.items.forEach(assertMemeBankTransfer);
    if (page.next_cursor !== null) assertCursor(page.next_cursor);
    return page;
  }

  async getMemeBankTransfer(transferId: string): Promise<MemeBankTransfer> {
    assertTransferId(transferId);
    const transfer = await this.#request<MemeBankTransfer>(
      `/v1/integrations/memebank/transfers/${encodeURIComponent(transferId)}`,
    );
    assertMemeBankTransfer(transfer);
    return transfer;
  }

  async acknowledgeMemeBankTransfer(
    transferId: string,
    idempotencyKey: string,
    request: AcknowledgeMemeBankTransferRequest,
  ): Promise<MemeBankTransfer> {
    assertTransferId(transferId);
    assertIdempotencyKey(idempotencyKey);
    assertAcknowledgement(request);
    const transfer = await this.#request<MemeBankTransfer>(
      `/v1/integrations/memebank/transfers/${encodeURIComponent(transferId)}/ack`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify(request),
      },
    );
    assertMemeBankTransfer(transfer);
    return transfer;
  }

  cancelMemeBankTransfer(transferId: string): Promise<void> {
    assertTransferId(transferId);
    return this.#request<void>(
      `/v1/integrations/memebank/transfers/${encodeURIComponent(transferId)}`,
      { method: 'DELETE' },
    );
  }
}

function assertBearer(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_BEARER_LENGTH || value !== value.trim() || /[\r\n]/.test(value)) {
    throw new CliptownContractError('invalid delegated bearer');
  }
}

function assertIdempotencyKey(value: string): void {
  if (value.length < 16 || value.length > 128 || !PORTABLE_IDENTIFIER.test(value)) {
    throw new CliptownContractError('invalid idempotency key');
  }
}

function assertLimit(limit: number, maximum: number): void {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > maximum) {
    throw new CliptownContractError(`limit must be an integer from 1 through ${maximum}`);
  }
}

function assertCursor(value: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || /[\r\n]/.test(value)) {
    throw new CliptownContractError('invalid cursor');
  }
}

function assertTransferId(value: string): void {
  if (!CANONICAL_UUID.test(value)) {
    throw new CliptownContractError('invalid transfer identifier');
  }
}

function assertMemeBankDirection(value: string): asserts value is MemeBankTransferDirection {
  if (value !== 'memebank_to_cliptown' && value !== 'cliptown_to_memebank') {
    throw new CliptownContractError('invalid transfer direction');
  }
}

function assertMemeBankState(value: string): asserts value is MemeBankTransferState {
  if (!['pending', 'acknowledged', 'ignored', 'rejected', 'expired', 'cancelled'].includes(value)) {
    throw new CliptownContractError('invalid transfer state');
  }
}

function assertCipherEnvelope(value: MemeBankCipherEnvelope): void {
  if (!value || (value.algorithm !== 'xchacha20poly1305-v1' && value.algorithm !== 'aes-256-gcm-v1')) {
    throw new CliptownContractError('invalid cipher algorithm');
  }
  if (!validBase64(value.nonce, 128) || !validBase64(value.ciphertext, MAX_INLINE_CIPHERTEXT_LENGTH)) {
    throw new CliptownContractError('invalid cipher envelope');
  }
  if (!validPortableIdentifier(value.key_id, 128)) {
    throw new CliptownContractError('invalid encryption key identifier');
  }
  if (value.associated_data_hash !== undefined && value.associated_data_hash !== null && !validBase64(value.associated_data_hash, 128)) {
    throw new CliptownContractError('invalid associated-data hash');
  }
}

function assertCreateMemeBankTransfer(request: CreateMemeBankTransferRequest): void {
  if (!request || request.contract_version !== 1) {
    throw new CliptownContractError('unsupported MemeBank contract version');
  }
  assertMemeBankDirection(request.direction);
  if (!validPortableIdentifier(request.source_item_id, 128)) {
    throw new CliptownContractError('invalid source item identifier');
  }
  if (!/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/.test(request.media_type) || request.media_type.length > 128) {
    throw new CliptownContractError('invalid media type');
  }
  if (!SHA256_BASE64URL.test(request.content_sha256)) {
    throw new CliptownContractError('invalid content digest');
  }
  if (!Number.isSafeInteger(request.content_length) || request.content_length < 0 || request.content_length > MAX_SOURCE_CONTENT_LENGTH) {
    throw new CliptownContractError('invalid source content length');
  }
  if (!validTimestamp(request.expires_at)) {
    throw new CliptownContractError('invalid transfer expiry');
  }
  assertCipherEnvelope(request.payload);
  if (request.encrypted_metadata !== undefined && request.encrypted_metadata !== null) {
    assertCipherEnvelope(request.encrypted_metadata);
  }
}

function assertMemeBankTransfer(transfer: MemeBankTransfer): void {
  assertCreateMemeBankTransfer(transfer);
  assertTransferId(transfer.transfer_id);
  assertMemeBankState(transfer.state);
  if (!validTimestamp(transfer.created_at) || !validTimestamp(transfer.updated_at)) {
    throw new CliptownContractError('invalid transfer timestamps');
  }
  if (transfer.acknowledged_at !== undefined && transfer.acknowledged_at !== null && !validTimestamp(transfer.acknowledged_at)) {
    throw new CliptownContractError('invalid acknowledgement timestamp');
  }
}

function assertAcknowledgement(request: AcknowledgeMemeBankTransferRequest): void {
  if (!request || request.contract_version !== 1 || !['acknowledged', 'ignored', 'rejected'].includes(request.disposition)) {
    throw new CliptownContractError('invalid transfer acknowledgement');
  }
  if (!validPortableIdentifier(request.client_receipt_id, 128) || request.client_receipt_id.length < 16) {
    throw new CliptownContractError('invalid acknowledgement receipt identifier');
  }
}

function validPortableIdentifier(value: string, maximum: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && PORTABLE_IDENTIFIER.test(value);
}

function validBase64(value: string, maximum: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum && BASE64.test(value);
}

function validTimestamp(value: string): boolean {
  return typeof value === 'string' && value.length <= 64 && Number.isFinite(Date.parse(value));
}

function safeErrorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: unknown; code?: unknown };
    const candidate = typeof parsed.code === 'string'
      ? parsed.code
      : typeof parsed.error === 'string'
        ? parsed.error
        : undefined;
    return candidate !== undefined && candidate.length <= 128 && !/[\r\n]/.test(candidate)
      ? candidate
      : undefined;
  } catch {
    return undefined;
  }
}
