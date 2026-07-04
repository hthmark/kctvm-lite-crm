'use strict';

const supabase = require('./supabase');

const POLL_INTERVAL_MS = 3 * 60 * 1000;
const STALE_AFTER_MS = 60 * 60 * 1000;

async function flagStaleLeads() {
  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const { data, error } = await supabase
      .from('leads')
      .update({ needs_followup: true })
      .not('status', 'in', '("Job Complete","Cancelled")')
      .eq('needs_followup', false)
      .lt('last_inbound_at', cutoff)
      .select();
    if (error) throw error;
    console.log(`[FollowUpPoller] Flagged ${data?.length || 0} lead(s) for follow-up`);
  } catch (err) {
    console.error('[FollowUpPoller] error:', err.message);
  }
}

function startFollowUpPoller() {
  setInterval(flagStaleLeads, POLL_INTERVAL_MS);
}

module.exports = { startFollowUpPoller };
