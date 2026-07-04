'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');

const smsRoutes = require('./routes/sms');
const adminRoutes = require('./routes/admin');
const leadsRoutes = require('./routes/leads');
const { startFollowUpPoller } = require('./lib/poller');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(smsRoutes);
app.use(adminRoutes);
app.use(leadsRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`KCTVM Lite CRM listening on port ${PORT}`);
  startFollowUpPoller();
});

module.exports = app;
