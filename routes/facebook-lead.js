'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { normalizePhone } = require('../lib/phone');
const { findLeadByPhone, createLead, logMessage } = require('../lib/leads');
const { sendSMS } = require('../lib/telnyx');
const { alertOwner } = require('../lib/owner-alert');

function sizeLabel(rawSize) {
  const val = String(rawSize || '').toLowerCase();
  if (val.includes('smaller')) return 'a TV under 65"';
  if (val.includes('larger')) return 'a TV over 65"';
  return null;
}

function buildOpenerText(name, tvSize, hasMount, city) {
  const firstName = (name || '').trim().split(/\s+/)[0] || 'there';
  const size = sizeLabel(tvSize);
  const mountNote = (String(hasMount || '').toLowerCase() === 'no') ? ', and we can get you set up with a mount too' : '';
  const jobPhrase = size ? `${size}${mountNote}` : 'a TV mounted';
  const cityPhrase = city ? ` in ${city}` : '';
  return `Hey ${firstName}, it's Gabe from Kansas City TV Mounting! Saw you're interested in getting ${jobPhrase}${cityPhrase} — what day and time works best for you?`;
}

router.post('/webhook/facebook-lead', async (req, res) => {
  try {
    const {
      name, phone: rawPhone, city, tv_size, has_mount,
      ad_name, campaign_name, form_name, platform
    } = req.body || {};

    if (!rawPhone) return res.status(400).json({ error: 'phone is required' });
    const phone = normalizePhone(rawPhone);
    const quoteDetails = { tv_size, has_mount, ad_name, campaign_name, form_name, platform };

    let lead = await findLeadByPhone(phone);

    if (!lead) {
      lead = await createLead(phone, {
        name,
        city,
        source: 'Facebook Ads',
        quote_details: quoteDetails
      });

      await alertOwner(`New lead (Facebook Ad): ${name || phone}, ${city || 'no city'}`);

      try {
        const opener = buildOpenerText(name, tv_size, has_mount, city);
        await sendSMS(phone, opener);
        await logMessage(lead.id, 'assistant', opener);
      } catch (err) {
        console.error('[FacebookLead] opener SMS error:', err.message);
      }
    } else {
      const { data, error } = await supabase
        .from('leads')
        .update({ name, city, quote_details: quoteDetails, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
        .select()
        .limit(1);
      if (error) throw error;
      lead = data?.[0] ?? lead;
    }

    res.status(200).json({ id: lead.id });
  } catch (err) {
    console.error('[FacebookLead] error:', err.message);
    res.status(500).json({ error: 'failed to save lead' });
  }
});

module.exports = router;
