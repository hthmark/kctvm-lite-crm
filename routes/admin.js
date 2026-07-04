'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { sendSMS } = require('../lib/telnyx');

router.post('/admin/send-sms', async (req, res) => {
  try {
    const { lead_id, message } = req.body || {};
    if (!lead_id || !message) {
      return res.status(400).json({ error: 'lead_id and message are required' });
    }

    const { data: leads, error: leadError } = await supabase
      .from('leads').select('phone').eq('id', lead_id).limit(1);
    if (leadError) throw leadError;
    const lead = leads?.[0] ?? null;
    if (!lead) return res.status(404).json({ error: 'lead not found' });

    await sendSMS(lead.phone, message);

    const { data: inserted, error: insertError } = await supabase
      .from('messages').insert({ lead_id, role: 'assistant', body: message }).select().limit(1);
    if (insertError) throw insertError;

    res.json(inserted?.[0] ?? null);
  } catch (err) {
    console.error('[AdminSendSMS] error:', err.message);
    res.status(500).json({ error: 'failed to send message' });
  }
});

module.exports = router;
