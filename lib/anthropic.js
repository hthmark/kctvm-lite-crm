'use strict';

const Anthropic = require('@anthropic-ai/sdk');

// Temporary debug logging — remove once the "Premature close" investigation
// is resolved. Confirms Railway actually injected the key without printing it.
console.log('[Anthropic] ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);
console.log('[Anthropic] ANTHROPIC_API_KEY prefix:', process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.slice(0, 7) : 'undefined');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

console.log('[BUILD CHECK] Anthropic client type:', client.constructor.name);

module.exports = client;
