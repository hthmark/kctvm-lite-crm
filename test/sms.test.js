'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSender, getProvider } = require('../lib/sms');
const { buildMessageRecord } = require('../lib/message-record');

test('Quo uses the configured inbox and raw API key, with no Telnyx fallback', async () => {
  let request;
  const send = createSender({
    env: { SMS_PROVIDER: 'quo', QUO_API_KEY: 'test-key', QUO_PHONE_NUMBER: 'PNtest' },
    post: async (...args) => { request = args; return { data: { data: { id: 'ACtest', createdAt: '2026-10-04T12:00:00Z' } } }; },
    sendTelnyx: () => assert.fail('Telnyx should not be called')
  });
  const receipt = await send('+19135550123', 'Your quote is $149.');
  assert.equal(request[0], 'https://api.quo.com/v1/messages');
  assert.deepEqual(request[1], { from: 'PNtest', to: ['+19135550123'], content: 'Your quote is $149.' });
  assert.equal(request[2].headers.Authorization, 'test-key');
  assert.equal(receipt.provider, 'quo');
  assert.equal(receipt.id, 'ACtest');
});

test('Telnyx remains the default until explicit activation', async () => {
  let count = 0;
  const send = createSender({ env: { QUO_API_KEY: 'test' }, post: () => assert.fail(), sendTelnyx: async () => count++ });
  await send('+19135550123', 'Hello');
  assert.equal(count, 1);
  assert.throws(() => getProvider({ SMS_PROVIDER: 'typo' }));
});

test('Quo validates configuration and input before any network request', async () => {
  const env = { SMS_PROVIDER: 'quo', QUO_API_KEY: 'test', QUO_PHONE_NUMBER_ID: 'PNtest' };
  const send = createSender({ env, post: () => assert.fail(), sendTelnyx: () => assert.fail() });
  await assert.rejects(send('9135550123', 'Hello'), /E.164/);
  await assert.rejects(send('+19135550123', ' '), /1–1600/);
  await assert.rejects(send('+19135550123', 'x'.repeat(1601)), /1–1600/);
  env.QUO_API_KEY = '';
  await assert.rejects(send('+19135550123', 'Hello'), /required/);
});

test('Quo errors are sanitized and never retry or switch providers', async () => {
  let attempts = 0;
  const send = createSender({
    env: { SMS_PROVIDER: 'quo', QUO_API_KEY: 'secret', QUO_PHONE_NUMBER_ID: 'PNtest' },
    post: async () => { attempts++; throw { response: { status: 403, data: { code: '0204403', message: 'secret' } }, config: { headers: { Authorization: 'secret' } } }; },
    sendTelnyx: () => assert.fail()
  });
  await assert.rejects(send('+19135550123', 'Hello'), error => {
    assert.equal(error.message, 'Quo SMS request failed: 403 (0204403)');
    assert.equal(JSON.stringify(error).includes('secret'), false);
    return true;
  });
  assert.equal(attempts, 1);
});

test('send receipt and webhook map to the same UUID; distinct messages do not', () => {
  const receipt = { provider: 'quo', id: 'ACfirst', createdAt: '2026-10-04T12:00:00Z' };
  const first = buildMessageRecord('lead', 'assistant', 'Hello', receipt);
  assert.equal(first.id, buildMessageRecord('lead', 'assistant', 'Hello', { ...receipt }).id);
  assert.notEqual(first.id, buildMessageRecord('lead', 'assistant', 'Hello', { ...receipt, id: 'ACsecond' }).id);
  assert.match(first.id, /^[\da-f]{8}-[\da-f]{4}-8[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/);
  assert.equal(first.created_at, '2026-10-04T12:00:00.000Z');
  assert.deepEqual(buildMessageRecord('lead', 'user', 'Old provider'), { lead_id: 'lead', role: 'user', body: 'Old provider' });
});
