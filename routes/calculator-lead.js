'use strict';

const express = require('express');
const cors = require('cors');
const router = express.Router();
const supabase = require('../lib/supabase');
const { normalizePhone } = require('../lib/phone');
const { findLeadByPhone, createLead, logMessage } = require('../lib/leads');
const { sendSMS } = require('../lib/telnyx');
const { alertOwner } = require('../lib/owner-alert');

// Scoped to this route only — the calculator is embedded via Framer, so
// requests arrive from the live site and from Framer's preview subdomains.
const calculatorCors = cors({
  origin(origin, callback) {
    const allowed = !origin
      || origin === 'null'
      || origin === 'https://kansascitytvmounting.com'
      || /\.framer\.(app|website)$/.test(origin);
    callback(null, allowed);
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
});

router.use('/webhook/calculator-lead', calculatorCors);

function buildQuoteDetails(body) {
  const numTvs = Math.min(Number(body.num_tvs) || 0, 10);
  const tvs = [];
  for (let i = 1; i <= numTvs; i++) {
    const size = body[`tv_${i}_size`];
    if (!size) continue;
    tvs.push({
      size,
      inches: body[`tv_${i}_inches`],
      mount: body[`tv_${i}_mount`],
      wall: body[`tv_${i}_wall`],
      wire: body[`tv_${i}_wire`]
    });
  }
  return {
    preferred_time: body.preferred_time,
    num_tvs: body.num_tvs,
    total_price: body.total_price,
    tvs
  };
}

function describeJob(tvs) {
  const MOUNT_PHRASES = { yes: 'using your existing mount', fixed: 'a fixed mount', articulating: 'an articulating mount' };
  const WIRE_PHRASES = { no: 'no wire concealment', cable: 'wire concealment' };

  return tvs.map(tv => {
    const sizeLabel = tv.inches ? `${tv.inches}"` : (tv.size === 'small' ? 'under 65"' : '65"+');
    const mountPhrase = MOUNT_PHRASES[tv.mount] || 'a mount';
    const wallPhrase = tv.wall || 'drywall';
    const wirePhrase = WIRE_PHRASES[tv.wire] || 'no wire concealment';
    return `a ${sizeLabel} TV installation with ${mountPhrase}, in ${wallPhrase}, ${wirePhrase}`;
  }).join('; and ');
}

function buildConfirmationText(name, quoteDetails) {
  const firstName = (name || '').trim().split(/\s+/)[0] || 'there';
  const jobDescription = describeJob(quoteDetails.tvs || []);
  const price = quoteDetails.total_price;
  const time = quoteDetails.preferred_time || 'your preferred time';
  return `Hey ${firstName}, it's Gabe from Kansas City TV Mounting. Just saw you submitted a quote online for ${jobDescription}. If $${price} works for you we can get you scheduled for ${time}?`;
}

router.post('/webhook/calculator-lead', async (req, res) => {
  try {
    const { name, phone: rawPhone, city } = req.body || {};
    if (!rawPhone) return res.status(400).json({ error: 'phone is required' });
    const phone = normalizePhone(rawPhone);
    const quoteDetails = buildQuoteDetails(req.body || {});

    let lead = await findLeadByPhone(phone);

    if (!lead) {
      lead = await createLead(phone, { name, city, source: 'Quote Calculator', quote_details: quoteDetails });

      await alertOwner(`New lead (quote calculator): ${name || phone}, ${city || 'no city'} — $${quoteDetails.total_price || '?'}`);

      if (!lead.quote_text_sent) {
        try {
          const confirmationText = buildConfirmationText(name, quoteDetails);
          await sendSMS(phone, confirmationText);
          await logMessage(lead.id, 'assistant', confirmationText);
          await supabase.from('leads').update({ quote_text_sent: true }).eq('id', lead.id);
        } catch (err) {
          console.error('[CalculatorLead] confirmation SMS error:', err.message);
          // Don't fail the whole request if the text fails — the lead is still saved.
        }
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
    console.error('[CalculatorLead] error:', err.message);
    res.status(500).json({ error: 'failed to save lead' });
  }
});

module.exports = router;
