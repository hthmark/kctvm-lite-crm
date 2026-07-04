'use strict';

const express = require('express');
const router = express.Router();
const stripe = require('../lib/stripe');

router.post('/api/create-payment-link', async (req, res) => {
  try {
    const { amount, description } = req.body || {};
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ error: 'amount is required and must be a positive number' });
    }

    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: description || 'TV Mounting Service'
          },
          unit_amount: Math.round(numericAmount * 100)
        },
        quantity: 1
      }]
    });

    console.log('[Stripe] Payment link created:', paymentLink.id);
    res.json({ url: paymentLink.url });
  } catch (err) {
    console.error('[Stripe] Payment link creation error:', err.message);
    res.status(500).json({ error: "Couldn't create payment link — check Stripe connection" });
  }
});

module.exports = router;
