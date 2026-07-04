'use strict';

const supabase = require('./supabase');

// Single source of truth for "has this phone number ever contacted us
// before" — used by every inbound entry point (SMS, missed call, etc.)
// so the "only the very first contact gets an automated reply" rule
// behaves identically regardless of channel.
async function findLeadByPhone(phone) {
  const { data, error } = await supabase.from('leads').select('*').eq('phone', phone).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
}

async function createLead(phone) {
  const { data, error } = await supabase.from('leads').insert({
    phone,
    status: 'Lead',
    last_inbound_at: new Date().toISOString(),
    needs_followup: false
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

async function logMessage(leadId, role, body) {
  await supabase.from('messages').insert({ lead_id: leadId, role, body });
}

module.exports = { findLeadByPhone, createLead, markLeadContacted, logMessage };
