'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const smsRoutes = require('./routes/sms');
const missedCallRoutes = require('./routes/missed-call');
const adminRoutes = require('./routes/admin');
const leadsRoutes = require('./routes/leads');
const paymentLinkRoutes = require('./routes/payment-link');
const calculatorLeadRoutes = require('./routes/calculator-lead');
const facebookLeadRoutes = require('./routes/facebook-lead');
const { startFollowUpPoller } = require('./lib/poller');

console.log('[OwnerAlert] OWNER_ALERT_PHONE present:', !!process.env.OWNER_ALERT_PHONE);

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(smsRoutes);
app.use(missedCallRoutes);
app.use(adminRoutes);
app.use(leadsRoutes);
app.use(paymentLinkRoutes);
app.use(calculatorLeadRoutes);
app.use(facebookLeadRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`KCTVM Lite CRM listening on port ${PORT}`);
  startFollowUpPoller();
});

module.exports = app;
