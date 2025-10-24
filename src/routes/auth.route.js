const router = require('express').Router();
const passport = require('passport');
require('../config/passport.config'); // Đảm bảo cấu hình passport được load

const { 
    register, 
    login, 
    refresh, 
    logout, 
    me, 
    googleAuthCallback,
    verifyOtp // IMPORT HÀM XÁC MINH OTP
} = require('../controllers/auth.controller'); 
const { auth } = require('../middleware/auth');


// ---------------------------------
// --- EMAIL/PASSWORD ROUTES ---
// ---------------------------------
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth(true), me);

// *** ROUTE XÁC MINH OTP MỚI ***
router.post('/verify-otp', verifyOtp);

// ---------------------------
// --- GOOGLE OAUTH ROUTES ---
// ---------------------------

// 1. Route Khởi tạo: Bắt đầu quá trình OAuth
router.get('/google', passport.authenticate('google', {
    scope: ['profile', 'email'],
    session: false, 
})); 

// 2. Route Callback: Nhận dữ liệu từ Google
router.get('/google/callback', 
    passport.authenticate('google', { 
        // Đã sửa lỗi: Chuyển hướng về /auth khi thất bại
        failureRedirect: '/auth', 
        session: false 
    }),
    googleAuthCallback // Hàm xử lý cuối cùng (phát hành token)
);


module.exports = router;