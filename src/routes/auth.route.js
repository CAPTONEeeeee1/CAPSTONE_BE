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

router.get('/google/callback', (req, res, next) => {
  const frontendUrl =
    process.env.CORS_ORIGINS?.split(',')[0]?.trim() || 'http://localhost:5173';

  passport.authenticate('google', {
    session: false,
    failureRedirect: `${frontendUrl}/auth?error=google_failed`, // Redirect cơ bản
  }, (err, user, info) => {
    // Xử lý lỗi từ passport (ví dụ: cấu hình sai)
    if (err) {
      console.error('Google Auth Error:', err);
      const url = new URL(`${frontendUrl}/auth`);
      url.searchParams.set('error', 'internal_error');
      url.searchParams.set('message', 'Lỗi hệ thống trong quá trình xác thực.');
      return res.redirect(url.toString());
    }
    
    // Xử lý thất bại xác thực (ví dụ: tài khoản bị khóa)
    if (!user) {
      const url = new URL(`${frontendUrl}/auth`);
      // info.message được cung cấp từ strategy
      if (info && info.message) {
        url.searchParams.set('error', 'account_suspended');
        url.searchParams.set('message', info.message);
      } else {
        url.searchParams.set('error', 'google_failed');
        url.searchParams.set('message', 'Đăng nhập với Google thất bại.');
      }
      return res.redirect(url.toString());
    }

    // Nếu thành công, chuyển cho controller xử lý
    req.user = user;
    googleAuthCallback(req, res);
  })(req, res, next);
});

module.exports = router;
