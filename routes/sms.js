'use strict';

const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const anthropic = require('../lib/anthropic');
const { sendSMS } = require('../lib/telnyx');
const { normalizePhone } = require('../lib/phone');
const { CONCIERGE_SYSTEM_PROMPT } = require('../concierge-prompt');

const FALLBACK_REPLY = "Hey! Thanks for reaching out to Kansas City TV Mounting — Gabe will get right back to you with details!";

function parseInbound(req) {
  const payload = req.body?.data?.payload;
  return {
    from: payload?.from?.phone_number || null,
    text: (payload?.text || '').trim(),
    direction: payload?.direction || null
  };
}

async function generateReply(inboundText, attempt = 1) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: CONCIERGE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: inboundText }]
    });
    const textBlock = (response.content || []).find(b => b.type === 'text');
    const reply = textBlock ? textBlock.text.trim() : '';
    return reply || FALLBACK_REPLY;
  } catch (err) {
    console.error(`[Webhook] Anthropic error (attempt ${attempt}):`, err.message);
    if (attempt < 2) return generateReply(inboundText, attempt + 1);
    return FALLBACK_REPLY;
  }
}

router.post('/webhook/sms-inbound', async (req, res) => {
  res.status(200).json({ received: true });
  try {
    const { from, text, direction } = parseInbound(req);
    if (!from) return;
    const phone = normalizePhone(from);

    // Self-loop guard — must run before any DB reads or Anthropic calls.
    // Telnyx can echo our own outbound sends back through this same webhook;
    // without this, a reply to a customer creates a phantom lead for our
    // own business number and Telnyx rejects the follow-up send because
    // source and destination are identical.
    if (direction && direction !== 'inbound') {
      console.log('[Webhook] Ignoring non-inbound event (direction: ' + direction + ')');
      return;
    }
    const businessNumber = normalizePhone(process.env.TELNYX_PHONE_NUMBER);
    if (phone === businessNumber) {
      console.log('[Webhook] Ignoring self-loop message from business number');
      return;
    }

    let lead = null;
    try {
      const { data, error } = await supabase.from('leads').select('*').eq('phone', phone).limit(1);
      if (error) throw error;
      lead = data?.[0] ?? null;
    } catch (err) {
      console.error('[Webhook] Lead lookup error:', err.message);
      return;
    }

    if (!lead) {
      try {
        const { data, error } = await supabase.from('leads').insert({
          phone,
          status: 'Lead',
          last_inbound_at: new Date().toISOString(),
          needs_followup: false
        }).select().limit(1);
        if (error) throw error;
        lead = data?.[0] ?? null;
      } catch (err) {
        console.error('[Webhook] Lead insert error:', err.message);
        return;
      }
      if (!lead) return;

      try {
        await supabase.from('messages').insert({ lead_id: lead.id, role: 'user', body: text });
      } catch (err) {
        console.error('[Webhook] Inbound message insert error:', err.message);
      }

      const reply = await generateReply(text);

      try {
        await sendSMS(phone, reply);
      } catch (err) {
        console.error('[Webhook] sendSMS error:', err.message);
      }

      try {
        await supabase.from('messages').insert({ lead_id: lead.id, role: 'assistant', body: reply });
      } catch (err) {
        console.error('[Webhook] Assistant message insert error:', err.message);
      }
    } else {
      try {
        await supabase.from('leads').update({
          last_inbound_at: new Date().toISOString(),
          needs_followup: false
        }).eq('id', lead.id);
      } catch (err) {
        console.error('[Webhook] Lead update error:', err.message);
      }

      try {
        await supabase.from('messages').insert({ lead_id: lead.id, role: 'user', body: text });
      } catch (err) {
        console.error('[Webhook] Inbound message insert error:', err.message);
      }
    }
  } catch (err) {
    console.error('[Webhook] Unexpected error:', err.message);
  }
});

module.exports = router;
