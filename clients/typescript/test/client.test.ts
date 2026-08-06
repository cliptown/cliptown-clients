import test from 'node:test'; import assert from 'node:assert/strict'; import {CliptownClient, CliptownApiError} from '../src/client.js';
test('requires https away from localhost',()=>{ assert.throws(()=>new CliptownClient({endpoint:'http://example.com',tokenProvider:{async accessToken(){return 'x'}}})); });

test('API errors carry status and path but never the response body', async () => {
  const client = new CliptownClient({
    endpoint: 'https://clips.example',
    tokenProvider: { accessToken: async () => 'token' },
    fetchImpl: async () =>
      new Response('{"leaked_token":"st_secret","email":"user@example.test"}', { status: 500 }),
  });

  await assert.rejects(() => client.listClips(), (error: Error) => {
    assert.ok(error instanceof CliptownApiError);
    assert.equal(error.status, 500);
    assert.doesNotMatch(error.message, /st_secret|user@example\.test/);
    return true;
  });
});

test('requests refuse to follow redirects while holding a bearer', async () => {
  let seen: RequestInit | undefined;
  const client = new CliptownClient({
    endpoint: 'https://clips.example',
    tokenProvider: { accessToken: async () => 'token' },
    fetchImpl: async (_url, init) => {
      seen = init;
      return new Response('{"items":[],"next_cursor":null}', {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    },
  });

  await client.listClips();
  assert.equal(seen?.redirect, 'error');
});
