'use strict';

const express = require('express');
const { createHandler } = require('../lib/quo-webhook');
const { findLeadByPhone, logMessage } = require('../lib/leads');
const supabase = require('../lib/supabase');
const router = express.Router();

async function markContacted(id, createdAt) {
  const timestamp = new Date(createdAt).toISOString();
  const { error } = await supabase.from('leads')
    .update({ last_inbound_at: timestamp, needs_followup: false })
    .eq('id', id)
    .or(`last_inbound_at.is.null,last_inbound_at.lt.${timestamp}`);
  if (error) throw error;
}

router.post('/webhook/quo-messages', express.raw({ type: 'application/json', limit: '1mb' }),
  createHandler({ findLeadByPhone, logMessage, markContacted }));

module.exports = router;
