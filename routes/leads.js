'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { normalizePhone } = require('../lib/phone');
const { findLeadByPhone, createLead } = require('../lib/leads');

const PATCHABLE_FIELDS = ['status', 'name', 'city', 'needs_followup', 'quote_details'];

router.get('/api/leads', async (req, res) => {
  try {
    const { data: leadRows, error } = await supabase
      .from('leads').select('*').order('updated_at', { ascending: false });
    if (error) throw error;
    const leadsList = leadRows || [];

    let snippetByLeadId = {};
    try {
      const { data: recentMessages, error: msgError } = await supabase
        .from('messages')
        .select('lead_id, body, created_at')
        .order('created_at', { ascending: false });
      if (msgError) throw msgError;
      (recentMessages || []).forEach(m => {
        if (!(m.lead_id in snippetByLeadId)) snippetByLeadId[m.lead_id] = m.body;
      });
    } catch (err) {
      console.error('[GetLeads] snippet lookup error:', err.message);
    }

    const withSnippets = leadsList.map(l => ({
      ...l,
      last_message_snippet: snippetByLeadId[l.id] || ''
    }));

    res.json(withSnippets);
  } catch (err) {
    console.error('[GetLeads] error:', err.message);
    res.status(500).json({ error: 'failed to fetch leads' });
  }
});

router.get('/api/leads/:id/messages', async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache');
  try {
    const { data, error } = await supabase
      .from('messages').select('*').eq('lead_id', req.params.id).order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('[GetMessages] error:', err.message);
    res.status(500).json({ error: 'failed to fetch messages' });
  }
});

router.post('/api/leads/manual', async (req, res) => {
  try {
    const { name, phone: rawPhone, city, preferred_time, total_price, tvs } = req.body || {};
    if (!rawPhone) return res.status(400).json({ error: 'phone is required' });
    const phone = normalizePhone(rawPhone);

    const quoteDetails = {
      preferred_time: preferred_time || null,
      total_price: total_price !== undefined && total_price !== '' ? total_price : null,
      num_tvs: Array.isArray(tvs) ? tvs.length : 0,
      tvs: Array.isArray(tvs) ? tvs.filter(tv => tv && tv.size) : []
    };

    let lead = await findLeadByPhone(phone);

    if (!lead) {
      lead = await createLead(phone, { name, city, source: 'Manual', quote_details: quoteDetails });
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

    res.status(200).json(lead);
  } catch (err) {
    console.error('[ManualLead] error:', err.message);
    res.status(500).json({ error: 'failed to create lead' });
  }
});

router.patch('/leads/:id', async (req, res) => {
  try {
    const updates = {};
    for (const field of PATCHABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
        updates[field] = req.body[field];
      }
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'no valid fields to update' });
    }

    const { data, error } = await supabase
      .from('leads').update(updates).eq('id', req.params.id).select().limit(1);
    if (error) throw error;
    res.json(data?.[0] ?? null);
  } catch (err) {
    console.error('[PatchLead] error:', err.message);
    res.status(500).json({ error: 'failed to update lead' });
  }
});

module.exports = router;
