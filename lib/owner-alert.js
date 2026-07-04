'use strict';

const { sendSMS } = require('./telnyx');

const TRUNCATE_LENGTH = 60;

function truncate(text) {
  const trimmed = (text || '').trim();
  if (trimmed.length <= TRUNCATE_LENGTH) return trimmed;
  return trimmed.slice(0, TRUNCATE_LENGTH) + '...';
}

// Side-channel push alert to Gabe on new lead creation only — never logged
// to the messages table, never allowed to block the webhook it's called from.
async function alertOwner(message) {
  try {
    await sendSMS(process.env.OWNER_ALERT_PHONE, message);
  } catch (err) {
    console.error('[OwnerAlert] Failed to send new lead alert:', err.message);
  }
}

module.exports = { alertOwner, truncate };
