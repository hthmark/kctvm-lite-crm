'use strict';

const supabase = require('./supabase');
const { sendSMS } = require('./telnyx');
const { logMessage } = require('./leads');

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;
const FOLLOWUP_TEXT = "Just following up on this. If you're not interested anymore, no worries at all. Thanks and have a great day!";

async function flagStaleLeads() {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const { data: staleLeads, error } = await supabase
      .from('leads')
      .select('id, phone, status, followup_text_sent')
      .not('status', 'in', '("Job Complete","Cancelled")')
      .eq('needs_followup', false)
      .lt('last_inbound_at', cutoff);
    if (error) throw error;

    let textsSent = 0;

    for (const lead of staleLeads || []) {
      const shouldSendText = lead.status === 'Lead' && !lead.followup_text_sent;

      if (!shouldSendText) {
        await supabase.from('leads').update({ needs_followup: true }).eq('id', lead.id);
        continue;
      }

      try {
        await sendSMS(lead.phone, FOLLOWUP_TEXT);
        await logMessage(lead.id, 'assistant', FOLLOWUP_TEXT);
        await supabase.from('leads').update({
          needs_followup: true,
          followup_text_sent: true
        }).eq('id', lead.id);
        textsSent++;
      } catch (err) {
        console.error(`[FollowUpPoller] Failed to send follow-up text to ${lead.phone}:`, err.message);
        // Flag needs_followup regardless, but leave followup_text_sent false
        // so a failed send is retried on the next poller cycle.
        await supabase.from('leads').update({ needs_followup: true }).eq('id', lead.id);
      }
    }

    console.log(`[FollowUpPoller] Flagged ${(staleLeads || []).length} lead(s) for follow-up, sent ${textsSent} one-time follow-up text(s)`);
  } catch (err) {
    console.error('[FollowUpPoller] error:', err.message);
  }
}

function startFollowUpPoller() {
  setInterval(flagStaleLeads, POLL_INTERVAL_MS);
}

module.exports = { startFollowUpPoller };
