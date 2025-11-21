const router = require('express').Router();
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


// ---------------------------------
// --- EMAIL/PASSWORD & SESSION ---
// ---------------------------------

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth(true), me);

// --- PROFILE & PASSWORD MGMT ---

// Cập nhật hồ sơ
router.patch('/me', auth(true), updateProfile); 
// Thay đổi mật khẩu
router.post('/change-password', auth(true), changePassword);

// EMAIL VERIFICATION (OTP)

// Route Xác minh OTP (Dùng tên verify-otp để thống nhất endpoint)
router.post('/verify-otp', verifyEmail); 

// Gửi lại mã xác minh (Từ Code 2)
router.post('/resend-verification', resendVerification); 

// Forgot password

// Gửi mã đặt lại mật khẩu (OTP) (Từ Code 2)
router.post('/send-reset-code', sendResetCode); 
router.post('/reset-password', resetPassword); 


router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false, 
})); 

router.get('/google/callback', 
    passport.authenticate('google', { 
        failureRedirect: '/auth', 
        session: false 
    }),
    googleAuthCallback // Hàm xử lý cuối cùng (phát hành token)
);


module.exports = router;