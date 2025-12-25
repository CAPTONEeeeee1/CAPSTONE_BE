const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { prisma } = require('../shared/prisma'); 
const crypto = require('crypto'); // Dùng để tạo chuỗi ngẫu nhiên
const bcrypt = require('bcryptjs'); // *** SỬA LỖI: Dùng bcryptjs cho phù hợp với package.json ***
// Import normalizeEmail từ auth.controller.js
const { normalizeEmail } = require('../controllers/auth.controller'); 


// Thiết lập Google Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    // *** CẢI TIẾN: Dùng URL tuyệt đối để tránh lỗi proxy/protocol khi triển khai ***
    // URL này phải khớp 100% với "Authorized redirect URIs" trong Google Console
    callbackURL: `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/google/callback`,
    scope: ['profile', 'email'],
    // proxy: true, // Chỉ nếu sử dụng proxy
},
async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails[0].value;
        const fullName = profile.displayName;
        
        // 1. CHUẨN HÓA EMAIL GMAIL
        const normalizedEmail = normalizeEmail(email);

        // 2. Tìm người dùng bằng email đã chuẩn hóa
        let user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        if (user) {
            // Nếu người dùng tồn tại, kiểm tra trạng thái
            if (user.status === 'suspended') {
                // Nếu tài khoản bị khóa, không cho phép đăng nhập
                // Trả về false để passport biết xác thực thất bại
                return done(null, false, { message: 'Tài khoản của bạn đã bị khóa.' });
            }
        } else {
            // Nếu không tìm thấy, TẠO người dùng mới 
            user = await prisma.user.create({
                data: {
                    email: normalizedEmail,
                    fullName: fullName,
                    status: 'active', 
                    // Gán một chuỗi ngẫu nhiên/placeholder đã được hash vì trường là bắt buộc
                    passwordHash: bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10),
                    authMethod: 'google', // Đánh dấu là tài khoản Google
                }
            });
        }
        
        // 3. Trả về đối tượng user
        return done(null, user);

    } catch (error) {
        console.error("Passport Google Strategy Error:", error);
        return done(error, null);
    }
}));


module.exports = passport;
