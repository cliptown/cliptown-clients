import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CliptownClient,
  CliptownContractError,
  CliptownHttpError,
  type CreateMemeBankTransferRequest,
  type MemeBankTransfer,
} from '../src/client.js';

const transferId = '0198c4e8-5f4b-7d26-8c21-c4b44277b128';

function request(): CreateMemeBankTransferRequest {
  return {
    contract_version: 1,
    direction: 'memebank_to_cliptown',
    source_item_id: 'memebank-asset-001',
    media_type: 'image/png',
    content_sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    content_length: 1024,
    payload: {
      algorithm: 'xchacha20poly1305-v1',
      nonce: 'MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIz',
      ciphertext: 'ZW5jcnlwdGVkLWltYWdlLXBheWxvYWQ=',
      key_id: 'memebank-recipient-key-001',
    },
    expires_at: '2033-05-18T03:33:20Z',
  };
}

function transfer(overrides: Partial<MemeBankTransfer> = {}): MemeBankTransfer {
  return {
    ...request(),
    transfer_id: transferId,
    state: 'pending',
    created_at: '2033-05-18T03:30:00Z',
    updated_at: '2033-05-18T03:30:00Z',
    ...overrides,
  };
}

test('MemeBank transfer uses delegated bearer and API-only SDK route', async () => {
  let tokenCalls = 0;
  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    requests.push({url: String(input), init});
    return new Response(JSON.stringify(transfer()), {
      status: 201,
      headers: {'content-type': 'application/json'},
    });
  }) as typeof fetch;

  const client = new CliptownClient({
    endpoint: 'https://api.cliptown.app',
    tokenProvider: {
      async accessToken() {
        tokenCalls += 1;
        return 'shared-auth-delegated-token';
      },
    },
    fetchImpl,
  });

  const created = await client.createMemeBankTransfer(
    'create-transfer-0001',
    request(),
  );
  assert.equal(created.transfer_id, transferId);
  assert.equal(tokenCalls, 1);
  assert.equal(requests.length, 1);
  assert.equal(
    requests[0]?.url,
    'https://api.cliptown.app/v1/integrations/memebank/transfers',
  );
  assert.equal(requests[0]?.init?.method, 'POST');
  assert.equal(requests[0]?.init?.redirect, 'error');
  const headers = new Headers(requests[0]?.init?.headers);
  assert.equal(headers.get('authorization'), 'Bearer shared-auth-delegated-token');
  assert.equal(headers.get('idempotency-key'), 'create-transfer-0001');
  assert.equal(headers.get('content-type'), 'application/json');
});

test('invalid MemeBank requests fail before token lookup and network access', async () => {
  let tokenCalls = 0;
  let networkCalls = 0;
  const client = new CliptownClient({
    endpoint: 'https://api.cliptown.app',
    tokenProvider: {
      async accessToken() {
        tokenCalls += 1;
        return 'shared-auth-delegated-token';
      },
    },
    fetchImpl: (async (): Promise<Response> => {
      networkCalls += 1;
      return new Response('{}');
    }) as typeof fetch,
  });

  await assert.rejects(
    () => client.createMemeBankTransfer(
      'short',
      request(),
    ),
    CliptownContractError,
  );
  await assert.rejects(
    () => client.createMemeBankTransfer(
      'create-transfer-0001',
      {...request(), contract_version: 2} as unknown as CreateMemeBankTransferRequest,
    ),
    CliptownContractError,
  );
  await assert.rejects(
    () => client.getMemeBankTransfer('../other-user'),
    CliptownContractError,
  );

  assert.equal(tokenCalls, 0);
  assert.equal(networkCalls, 0);
});

test('unknown response contract versions fail closed', async () => {
  const client = new CliptownClient({
    endpoint: 'https://api.cliptown.app',
    tokenProvider: {
      async accessToken() {
        return 'shared-auth-delegated-token';
      },
    },
    fetchImpl: (async (): Promise<Response> => new Response(
      JSON.stringify({...transfer(), contract_version: 2}),
      {status: 200, headers: {'content-type': 'application/json'}},
    )) as typeof fetch,
  });

  await assert.rejects(
    () => client.getMemeBankTransfer(transferId),
    CliptownContractError,
  );
});

test('API errors expose only bounded deterministic codes', async () => {
  const client = new CliptownClient({
    endpoint: 'https://api.cliptown.app',
    tokenProvider: {
      async accessToken() {
        return 'shared-auth-delegated-token';
      },
    },
    fetchImpl: (async (): Promise<Response> => new Response(
      JSON.stringify({
        error: 'insufficient_assurance',
        ciphertext: 'must-not-escape',
      }),
      {status: 403, headers: {'content-type': 'application/json'}},
    )) as typeof fetch,
  });

  await assert.rejects(
    () => client.getMemeBankTransfer(transferId),
    (error) => {
      assert.ok(error instanceof CliptownHttpError);
      assert.equal(error.status, 403);
      assert.equal(error.code, 'insufficient_assurance');
      assert.equal(error.message.includes('must-not-escape'), false);
      return true;
    },
  );
});

test('remote plaintext HTTP and whitespace-wrapped bearer are rejected', async () => {
  assert.throws(
    () => new CliptownClient({
      endpoint: 'http://api.cliptown.app',
      tokenProvider: {async accessToken() { return 'x'; }},
    }),
  );

  let networkCalls = 0;
  const client = new CliptownClient({
    endpoint: 'https://api.cliptown.app',
    tokenProvider: {
      async accessToken() {
        return ' shared-auth-delegated-token';
      },
    },
    fetchImpl: (async (): Promise<Response> => {
      networkCalls += 1;
      return new Response('{}');
    }) as typeof fetch,
  });
  await assert.rejects(
    () => client.getMemeBankTransfer(transferId),
    CliptownContractError,
  );
  assert.equal(networkCalls, 0);
});
