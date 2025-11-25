const express = require('express');
const passport = require('passport');
require('../config/passport.config');

const {
  register,
  login,
  refresh,
  logout,
  me,
  updateProfile,
  changePassword,
  verifyEmail,
  resendVerification,
  sendResetCode,
  resetPassword,
  googleAuthCallback,
} = require('../controllers/auth.controller');

const { auth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);

router.post('/refresh', refresh);

router.post('/logout', logout);

router.get('/me', auth(true), me);


router.patch('/me', auth(true), updateProfile);


router.post('/change-password', auth(true), changePassword);


router.post('/verify-otp', verifyEmail);


router.post('/resend-verification', resendVerification);

router.post('/send-reset-code', sendResetCode);

router.post('/reset-password', resetPassword);

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false,
  })
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth?error=google_failed',
    session: false,
  }),
  googleAuthCallback
);

module.exports = router;
