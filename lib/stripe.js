'use strict';

const Stripe = require('stripe');

console.log('[Stripe] STRIPE_SECRET_KEY present:', !!process.env.STRIPE_SECRET_KEY);

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = stripe;
