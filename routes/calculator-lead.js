'use strict';

const express = require('express');
const cors = require('cors');
const router = express.Router();
const supabase = require('../lib/supabase');
const { normalizePhone } = require('../lib/phone');
const { findLeadByPhone, createLead } = require('../lib/leads');

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

router.post('/webhook/calculator-lead', async (req, res) => {
  try {
    const { name, phone: rawPhone, city } = req.body || {};
    if (!rawPhone) return res.status(400).json({ error: 'phone is required' });
    const phone = normalizePhone(rawPhone);
    const quoteDetails = buildQuoteDetails(req.body || {});

    let lead = await findLeadByPhone(phone);

    if (!lead) {
      lead = await createLead(phone, { name, city, source: 'Quote Calculator', quote_details: quoteDetails });
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
