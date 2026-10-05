'use strict';

const { createHmac, timingSafeEqual } = require('node:crypto');

// Versioned Quo webhooks (Quo-Api-Version: 2026-03-30), not legacy app webhooks.
function verifySignature(rawBody, headers, secret, now = Date.now()) {
  if (!Buffer.isBuffer(rawBody) || !secret?.startsWith('whsec_')) return false;
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatures = headers['webhook-signature'];
  if (![id, timestamp, signatures].every(v => typeof v === 'string' && v.length)) return false;
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = Buffer.from(secret.slice(6), 'base64');
  if (!key.length) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest('base64');
  return signatures.split(' ').some(entry => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const actual = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  });
}

function parseMessage(event, env = process.env) {
  if (!['message.received', 'message.delivered'].includes(event?.type)) return null;
  const message = event.data?.resource;
  const context = event.data?.context;
  const sender = (env.QUO_PHONE_NUMBER_ID || env.QUO_PHONE_NUMBER || '').trim();
  if (!message || !context || !sender) return null;
  const incoming = event.type === 'message.received';
  if (message.direction !== (incoming ? 'incoming' : 'outgoing')) return null;
  const recipients = context.recipientIdentifiers;
  // This CRM models one-to-one conversations only. Never mix group chats.
  if (!Array.isArray(recipients) || recipients.length !== 1) return null;
  if (sender.startsWith('PN')) {
    if (context.phoneNumberId !== sender) return null;
  } else if ((incoming ? recipients[0] : context.senderIdentifier) !== sender) return null;
  const phone = incoming ? context.senderIdentifier : recipients[0];
  if (typeof phone !== 'string' || !/^\+[1-9]\d{1,14}$/.test(phone)) return null;
  if (phone === context.senderIdentifier && !incoming) return null;
  if (incoming && phone === recipients[0]) return null;
  if (phone === env.OWNER_ALERT_PHONE) return null;
  if (typeof message.id !== 'string' || !message.id.startsWith('AC')) throw new Error('Invalid message ID');
  if (!Number.isFinite(Date.parse(message.createdAt))) throw new Error('Invalid message time');
  let body = typeof message.text === 'string' ? message.text : '';
  if (Array.isArray(message.media) && message.media.length) {
    body += `${body ? '\n' : ''}[Attachment — view in Quo]`;
  }
  if (!body) return null;
  return {
    phone, role: incoming ? 'user' : 'assistant', body,
    receipt: { provider: 'quo', id: message.id, createdAt: message.createdAt }
  };
}

function createHandler({ env = process.env, findLeadByPhone, logMessage, markContacted }) {
  return async (req, res) => {
    if (!env.QUO_WEBHOOK_SECRET) return res.status(503).json({ error: 'Quo sync is not configured' });
    if (!verifySignature(req.body, req.headers, env.QUO_WEBHOOK_SECRET)) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    let parsed;
    try {
      parsed = parseMessage(JSON.parse(req.body.toString('utf8')), env);
    } catch {
      return res.status(400).json({ error: 'Invalid message event' });
    }
    if (!parsed) return res.status(200).json({ received: true, ignored: true });
    try {
      const lead = await findLeadByPhone(parsed.phone);
      // Sync CRM customers only; do not import unrelated Quo conversations.
      if (!lead) return res.status(200).json({ received: true, ignored: true });
      await logMessage(lead.id, parsed.role, parsed.body, parsed.receipt);
      if (parsed.role === 'user') await markContacted(lead.id, parsed.receipt.createdAt);
      return res.status(200).json({ received: true });
    } catch {
      // Acknowledge only after storage succeeds; Quo can retry database failures.
      console.error('[QuoSync] Failed to persist message event');
      return res.status(500).json({ error: 'Message sync failed' });
    }
  };
}

module.exports = { verifySignature, parseMessage, createHandler };
