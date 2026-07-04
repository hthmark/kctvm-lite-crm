'use strict';

// Standalone diagnostic script — NOT wired into the app or npm start.
// Run manually (locally with a .env file, or in the Railway shell) to
// isolate whether Anthropic calls succeed outside of the webhook handler:
//   node test-anthropic.js

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

(async () => {
  console.log('ANTHROPIC_API_KEY present:', !!process.env.ANTHROPIC_API_KEY);
  console.log('ANTHROPIC_API_KEY prefix:', process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.slice(0, 7) : 'undefined');

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 50,
      messages: [{ role: 'user', content: 'Say hello in exactly five words.' }]
    });
    console.log('SUCCESS — raw response:', JSON.stringify(response, null, 2));
  } catch (err) {
    console.error('FAILURE — full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    console.error('err.status:', err.status);
    console.error('err.error:', err.error);
  }
})();
