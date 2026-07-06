'use strict';

const express = require('express');
const router = express.Router();
const { sendSMS } = require('../lib/telnyx');
const { normalizePhone } = require('../lib/phone');
const { findLeadByPhone, createLead, markLeadContacted, logMessage } = require('../lib/leads');
const { alertOwner } = require('../lib/owner-alert');

const MISSED_CALL_BODY = '[Missed Call]';
const MISSED_CALL_REPLY = "Hi, this is Gabe from Kansas City TV Mounting. So sorry I missed your call! How can I help?";

router.post('/webhook/missed-call', async (req, res) => {
  res.status(200).json({ received: true });
  try {
    const rawPhone = req.body?.phone;
    if (!rawPhone) return;
    const phone = normalizePhone(rawPhone);

    let lead = null;
    try {
      lead = await findLeadByPhone(phone);
    } catch (err) {
      console.error('[MissedCall] Lead lookup error:', err.message);
      return;
    }

    if (!lead) {
      try {
        lead = await createLead(phone, { source: 'Missed Call' });
      } catch (err) {
        console.error('[MissedCall] Lead insert error:', err.message);
        return;
      }
      if (!lead) return;

      try {
        await logMessage(lead.id, 'user', MISSED_CALL_BODY);
      } catch (err) {
        console.error('[MissedCall] Inbound message insert error:', err.message);
      }

      await alertOwner(`New lead (missed call): ${phone}`);

      try {
        await sendSMS(phone, MISSED_CALL_REPLY);
      } catch (err) {
        console.error('[MissedCall] sendSMS error:', err.message);
      }

      try {
        await logMessage(lead.id, 'assistant', MISSED_CALL_REPLY);
      } catch (err) {
        console.error('[MissedCall] Assistant message insert error:', err.message);
      }
    } else {
      try {
        await markLeadContacted(lead.id);
      } catch (err) {
        console.error('[MissedCall] Lead update error:', err.message);
      }

      try {
        await logMessage(lead.id, 'user', MISSED_CALL_BODY);
      } catch (err) {
        console.error('[MissedCall] Inbound message insert error:', err.message);
      }
    }
  } catch (err) {
    console.error('[MissedCall] Unexpected error:', err.message);
  }
});

module.exports = router;
