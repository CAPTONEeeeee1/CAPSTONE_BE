const router = require('express').Router();
const { register, login, refresh, logout, me, updateProfile, changePassword, verifyEmail, resendVerification, sendResetCode, resetPassword } = require('../controllers/auth.controller');
const { auth } = require('../middleware/auth');


router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth(true), me);
router.patch('/me', auth(true), updateProfile);
router.post('/change-password', auth(true), changePassword);
router.post('/send-forgot-password-otp', sendResetCode);
router.post('/reset-password', resetPassword);

// Email verification routes (OTP-based)
router.post('/verify-otp', verifyEmail);
router.post('/resend-verification', resendVerification);


module.exports = router;