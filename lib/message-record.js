'use strict';

const { createHash } = require('node:crypto');

// Stable UUID fits the existing messages primary key, requiring no schema change.
// Both the send response and webhook use this ID, including across restarts.
function quoMessageId(providerId) {
  if (typeof providerId !== 'string' || !providerId.startsWith('AC')) {
    throw new Error('Invalid Quo message ID');
  }
  const bytes = createHash('sha256').update(`kctvm:quo:message:${providerId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function buildMessageRecord(leadId, role, body, receipt) {
  const record = { lead_id: leadId, role, body };
  if (receipt?.provider === 'quo') {
    record.id = quoMessageId(receipt.id);
    if (receipt.createdAt && Number.isFinite(Date.parse(receipt.createdAt))) {
      record.created_at = new Date(receipt.createdAt).toISOString();
    }
  }
  return record;
}

module.exports = { quoMessageId, buildMessageRecord };
