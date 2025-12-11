const express = require('express');
const router = express.Router();
const { createVNPayPayment, vnpayReturn, vnpayIpn } = require('../controllers/payment.controller');
const { auth } = require('../middleware/auth');

router.post('/create-vnpay-payment', auth(), createVNPayPayment);
router.get('/vnpay-return', vnpayReturn);
router.get('/vnpay-ipn', vnpayIpn);

module.exports = router;
