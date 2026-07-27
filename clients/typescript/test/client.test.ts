import test from 'node:test'; import assert from 'node:assert/strict'; import {CliptownClient} from '../src/client.js';
test('requires https away from localhost',()=>{ assert.throws(()=>new CliptownClient({endpoint:'http://example.com',tokenProvider:{async accessToken(){return 'x'}}})); });
