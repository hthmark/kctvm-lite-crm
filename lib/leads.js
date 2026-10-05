'use strict';

const supabase = require('./supabase');
const { buildMessageRecord } = require('./message-record');

// Single source of truth for "has this phone number ever contacted us
// before" — used by every inbound entry point (SMS, missed call, etc.)
// so the "only the very first contact gets an automated reply" rule
// behaves identically regardless of channel.
async function findLeadByPhone(phone) {
  const { data, error } = await supabase.from('leads').select('*').eq('phone', phone).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function createLead(phone, extra = {}) {
  const { data, error } = await supabase.from('leads').insert({
    phone,
    status: 'Lead',
    last_inbound_at: new Date().toISOString(),
    needs_followup: false,
    ...extra
  }).select().limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function markLeadContacted(leadId) {
  const { error } = await supabase.from('leads').update({
    last_inbound_at: new Date().toISOString(),
    needs_followup: false
  }).eq('id', leadId);
  if (error) throw error;
}

async function logMessage(leadId, role, body, receipt) {
  const record = buildMessageRecord(leadId, role, body, receipt);
  const query = record.id
    ? supabase.from('messages').upsert(record, { onConflict: 'id', ignoreDuplicates: true })
    : supabase.from('messages').insert(record);
  const { data, error } = await query.select().limit(1);
  if (error) throw error;
  if (data?.[0]) return data[0];
  // The delivery webhook may have inserted the same outgoing message first.
  const { data: existing, error: lookupError } = await supabase.from('messages')
    .select('*').eq('id', record.id).limit(1);
  if (lookupError) throw lookupError;
  return existing?.[0] ?? null;
}

module.exports = { findLeadByPhone, createLead, markLeadContacted, logMessage };
