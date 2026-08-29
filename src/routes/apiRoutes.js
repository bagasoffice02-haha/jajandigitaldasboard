// src/routes/apiRoutes.js
'use strict';

const express = require('express');
const router = express.Router();

const ordersRouter    = require('./orders');
const premiumRouter   = require('./premium');
const filesRouter     = require('./files');
const groupsRouter    = require('./groups');
const shopRouter      = require('./shop');
const hostAdminRouter = require('./hostAdmin');
const miscRouter      = require('./misc');
const configRouter    = require('./configRoute');
const referralRouter  = require('./referral');

// Mount sub-routers under /api
router.use('/', ordersRouter);
router.use('/premium', premiumRouter);
router.use('/', filesRouter);
router.use('/', groupsRouter);
router.use('/shop', shopRouter);
router.use('/host-admin', hostAdminRouter);
router.use('/', miscRouter);
router.use('/', configRouter);
router.use('/', referralRouter);

module.exports = router;
