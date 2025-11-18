const router = require('express').Router();
const { register, login, refresh, logout, me, updateProfile, changePassword, verifyEmail, resendVerification } = require('../controllers/auth.controller');
const { auth } = require('../middleware/auth');


router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth(true), me);
router.patch('/me', auth(true), updateProfile);
router.post('/change-password', auth(true), changePassword);

// Email verification routes (OTP-based)
router.post('/verify-otp', verifyEmail);
router.post('/resend-verification', resendVerification);


module.exports = router;