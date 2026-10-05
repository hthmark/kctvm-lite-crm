'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const express = require('express');
const { verifySignature, parseMessage, createHandler } = require('../lib/quo-webhook');
const { buildMessageRecord } = require('../lib/message-record');
const key = Buffer.from('test-only-webhook-secret-32-bytes!');
const env = { QUO_WEBHOOK_SECRET: `whsec_${key.toString('base64')}`, QUO_PHONE_NUMBER: 'PNtest', OWNER_ALERT_PHONE: '+19135550999' };

function fixture(incoming = true) {
  return {
    type: incoming ? 'message.received' : 'message.delivered',
    data: {
      resource: { id: 'ACtest', direction: incoming ? 'incoming' : 'outgoing', text: 'Hello', media: [], createdAt: '2026-10-04T12:00:00Z' },
      context: { phoneNumberId: 'PNtest', senderIdentifier: incoming ? '+19135550123' : '+19135550100', recipientIdentifiers: [incoming ? '+19135550100' : '+19135550123'] }
    }
  };
}

function sign(body, timestamp = String(Math.floor(Date.now() / 1000))) {
  const id = 'delivery-test';
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(body).digest('base64');
  return { 'webhook-id': id, 'webhook-timestamp': timestamp, 'webhook-signature': `v1,${signature}` };
}

test('signature verifies raw bytes and rejects tampering, missing headers, stale and future requests', () => {
  const body = Buffer.from(JSON.stringify(fixture()));
  const headers = sign(body);
  assert.equal(verifySignature(body, headers, env.QUO_WEBHOOK_SECRET), true);
  assert.equal(verifySignature(Buffer.concat([body, Buffer.from(' ')]), headers, env.QUO_WEBHOOK_SECRET), false);
  assert.equal(verifySignature(body, {}, env.QUO_WEBHOOK_SECRET), false);
  for (const offset of [-600, 600]) {
    assert.equal(verifySignature(body, sign(body, String(Math.floor(Date.now() / 1000) + offset)), env.QUO_WEBHOOK_SECRET), false);
  }
  assert.equal(verifySignature(body, { ...headers, 'webhook-signature': 'v1,x' }, env.QUO_WEBHOOK_SECRET), false);
});

test('parser filters other inboxes, groups and owner alerts and maps incoming/outgoing', () => {
  assert.equal(parseMessage(fixture(), env).role, 'user');
  assert.equal(parseMessage(fixture(false), env).role, 'assistant');
  for (const mutate of [
    e => { e.data.context.phoneNumberId = 'PNother'; },
    e => { e.data.context.recipientIdentifiers.push('+19135550777'); },
    e => { e.data.context.senderIdentifier = env.OWNER_ALERT_PHONE; },
    e => { e.type = 'call.completed'; }
  ]) {
    const event = fixture(); mutate(event); assert.equal(parseMessage(event, env), null);
  }
  const media = fixture(); media.data.resource.text = ''; media.data.resource.media = [{ url: 'https://example.test/photo' }];
  assert.equal(parseMessage(media, env).body, '[Attachment — view in Quo]');
});

test('HTTP webhook verifies raw body, persists both directions and retries failures', async t => {
  const records = new Map();
  let updates = 0;
  let fail = false;
  const app = express();
  app.post('/webhook/quo-messages', express.raw({ type: 'application/json' }), createHandler({
    env,
    findLeadByPhone: async phone => phone === '+19135550123' ? { id: 'lead' } : null,
    logMessage: async (...args) => {
      if (fail) throw new Error('database unavailable');
      const row = buildMessageRecord(...args); if (!records.has(row.id)) records.set(row.id, row);
    },
    markContacted: async () => { updates++; }
  }));
  app.use(express.json());
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/webhook/quo-messages`;
  const post = async (event, signed = true) => {
    const body = Buffer.from(JSON.stringify(event));
    return fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', ...(signed ? sign(body) : {}) } });
  };
  assert.equal((await post(fixture(), false)).status, 401);
  assert.equal(records.size, 0);
  assert.equal((await post(fixture())).status, 200);
  assert.equal((await post(fixture())).status, 200);
  assert.equal(records.size, 1);
  assert.equal(updates, 2);
  const outgoing = fixture(false); outgoing.data.resource.id = 'ACoutgoing';
  assert.equal((await post(outgoing)).status, 200);
  assert.equal(records.size, 2);
  assert.equal(updates, 2);
  fail = true;
  assert.equal((await post(fixture())).status, 500);
  fail = false;
  assert.equal((await post(fixture())).status, 200);
});
