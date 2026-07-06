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
      || origin === 'https://kansascitytvmounting.com'
      || /\.framer\.(app|website)$/.test(origin);
    callback(null, allowed);
  },
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
});

router.use('/webhook/calculator-lead', calculatorCors);

router.post('/webhook/calculator-lead', async (req, res) => {
  try {
    const { name, phone: rawPhone, city } = req.body || {};
    if (!rawPhone) return res.status(400).json({ error: 'phone is required' });
    const phone = normalizePhone(rawPhone);

    let lead = await findLeadByPhone(phone);

    if (!lead) {
      lead = await createLead(phone, { name, city, source: 'Quote Calculator' });
    } else {
      const { data, error } = await supabase
        .from('leads')
        .update({ name, city, updated_at: new Date().toISOString() })
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
