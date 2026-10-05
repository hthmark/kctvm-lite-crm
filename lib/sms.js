'use strict';

// Keep Telnyx active until the Quo cutover is explicitly enabled.
function getProvider(env = process.env) {
  const provider = (env.SMS_PROVIDER || 'telnyx').trim().toLowerCase();
  if (!['telnyx', 'quo'].includes(provider)) throw new Error('SMS_PROVIDER must be telnyx or quo');
  return provider;
}

function createSender({ env = process.env, post, sendTelnyx }) {
  return async function sendSMS(to, text) {
    if (getProvider(env) === 'telnyx') return sendTelnyx(to, text);

    // QUO_PHONE_NUMBER is also supported for the existing Railway setup.
    const from = (env.QUO_PHONE_NUMBER_ID || env.QUO_PHONE_NUMBER || '').trim();
    const apiKey = (env.QUO_API_KEY || '').trim();
    if (!apiKey || !from) throw new Error('Quo API key and sending inbox are required');
    if (!/^PN[A-Za-z0-9]+$/.test(from) && !/^\+[1-9]\d{1,14}$/.test(from)) {
      throw new Error('Quo sender must be an inbox ID or an E.164 phone number');
    }
    if (typeof to !== 'string' || !/^\+[1-9]\d{1,14}$/.test(to)) {
      throw new Error('SMS recipient must be an E.164 phone number');
    }
    if (typeof text !== 'string' || !text.trim() || text.length > 1600) {
      throw new Error('Quo message must contain 1–1600 characters');
    }
    if (from === to) throw new Error('Cannot send an SMS to the sending number');

    try {
      const response = await post('https://api.quo.com/v1/messages', {
        from,
        to: [to],
        content: text
      }, {
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
        timeout: 15000
      });
      const message = response.data?.data;
      if (!message?.id?.startsWith('AC')) throw new Error('Missing message receipt');
      return { provider: 'quo', id: message.id, createdAt: message.createdAt };
    } catch (err) {
      // Axios errors contain authorization headers; expose only status/code.
      const status = Number.isInteger(err.response?.status) ? err.response.status : 'network';
      const rawCode = String(err.response?.data?.code || '');
      const code = /^[A-Za-z0-9_-]{1,40}$/.test(rawCode) ? ` (${rawCode})` : '';
      throw new Error(`Quo SMS request failed: ${status}${code}`);
    }
    // Never fall back to Telnyx or retry automatically: a timed-out send may
    // already have been accepted, and another provider would change numbers.
  };
}

async function sendSMS(to, text) {
  const axios = require('axios');
  const telnyx = require('./telnyx');
  return createSender({ post: axios.post, sendTelnyx: telnyx.sendSMS })(to, text);
}

module.exports = { sendSMS, createSender, getProvider };
