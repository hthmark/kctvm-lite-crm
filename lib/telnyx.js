'use strict';

const axios = require('axios');

async function sendSMS(to, text) {
  try {
    await axios.post('https://api.telnyx.com/v2/messages', {
      from: process.env.TELNYX_PHONE_NUMBER,
      to: to,
      text: text
    }, {
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('[Telnyx] sendSMS error:', err.response?.data || err.message);
    throw err;
  }
}

module.exports = { sendSMS };
