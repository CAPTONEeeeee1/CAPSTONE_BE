const { prisma } = require('../shared/prisma');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { registerSchema, loginSchema, verifyOtpSchema } = require('../validators/auth.validators');
const { verifyRefresh } = require('../utils/jwt');
const { issueTokenPair, rotateRefreshToken, revokeRefreshToken } = require('../services/token.service');
const { sendVerificationEmail } = require('../services/email.service'); 
// const crypto = require('crypto'); // Không cần thiết ở đây nếu không dùng cho logic khác


function pickUA(req) { return req.headers['user-agent'] || 'unknown'; }
function pickIP(req) { return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress; }


// *** HÀM CHUẨN HÓA EMAIL GMAIL (BỎ DẤU CHẤM) ***
function normalizeEmail(email) {
    if (!email) return email;

    const parts = email.split('@');
    if (parts.length !== 2 || parts[1] !== 'gmail.com') {
        return email; 
    }

    const localPart = parts[0].replace(/\./g, '');
    return `${localPart}@${parts[1]}`;
}

// *** HÀM TẠO MÃ OTP 6 CHỮ SỐ ***
function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}


async function register(req, res) {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    let { email, password, fullName, phone } = parsed.data;

    const normalizedEmail = normalizeEmail(email);

    // 1. KIỂM TRA TÍNH DUY NHẤT CỦA EMAIL
    const existedByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existedByEmail) return res.status(409).json({ error: 'Email đã được sử dụng. Vui lòng sử dụng email khác.' });

    // 2. KIỂM TRA TÍNH DUY NHẤT CỦA PHONE (Chỉ kiểm tra nếu phone được cung cấp)
    if (phone) {
        const existedByPhone = await prisma.user.findUnique({ where: { phone } });
        if (existedByPhone) {
            return res.status(409).json({ error: 'Số điện thoại đã được đăng ký cho tài khoản khác.' });
        }
    }

    const passwordHash = await hashPassword(password);
    const verificationToken = generateOtp(); // TẠO MÃ OTP

    const user = await prisma.user.create({
        data: {
            email: normalizedEmail,
            passwordHash,
            fullName,
            phone, // Thêm user.phone (có thể là null/undefined nếu người dùng không nhập)
            status: 'pending', // Đặt trạng thái chờ kích hoạt
            verificationToken: verificationToken, // LƯU OTP
            authMethod: 'email', 
        }
    });

    try {
        // *** SỬA LỖI: Luôn sử dụng email đã chuẩn hóa để gửi mã OTP ***
        await sendVerificationEmail(normalizedEmail, verificationToken, fullName);
    } catch (error) {
        console.error("LỖI GỬI EMAIL:", error.message);
    }

    // Trả về 202 để frontend chuyển sang giao diện OTP
    return res.status(202).json({ 
        success: true,
        message: 'Đăng ký thành công. Vui lòng kiểm tra email để kích hoạt tài khoản của bạn.',
        // *** SỬA LỖI: Trả về đối tượng user đầy đủ để frontend có thể sử dụng ***
        user: { id: user.id, email: user.email, fullName: user.fullName }
    });
}


// *** CÁC HÀM KHÁC GIỮ NGUYÊN (verifyOtp, login, refresh, logout, me, googleAuthCallback) ***

async function verifyOtp(req, res) {
    const parsed = verifyOtpSchema.safeParse(req.body); 
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, otp } = parsed.data;

    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
        return res.status(404).json({ error: 'Người dùng không tồn tại.' });
    }

    if (user.status === 'active') {
        return res.status(400).json({ error: 'Tài khoản đã được kích hoạt.' });
    }

    // So sánh OTP dưới dạng chuỗi để tránh lỗi kiểu dữ liệu
    if (user.verificationToken !== otp.toString()) {
        return res.status(401).json({ error: 'Mã xác minh (OTP) không đúng.' });
    }

    try {
        // Cập nhật trạng thái người dùng và lấy lại thông tin mới nhất
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                status: 'active',
                verificationToken: null, 
            }
        });

        // *** CẢI TIẾN: Tự động đăng nhập và cấp token sau khi xác thực thành công ***
        const pair = await issueTokenPair(updatedUser, pickUA(req), pickIP(req));
        return res.json({ success: true, message: 'Tài khoản đã được kích hoạt thành công.', user: { id: updatedUser.id, email: updatedUser.email, fullName: updatedUser.fullName }, ...pair });

    } catch (e) {
        console.error("Prisma update failed during OTP verification:", e);
        return res.status(500).json({ error: 'Lỗi máy chủ: Không thể kích hoạt tài khoản. Vui lòng thử lại.' });
    }
}


async function login(req, res) {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    let { email, password } = parsed.data;

    const normalizedEmail = normalizeEmail(email);
    
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    
    if (user.authMethod === 'google') return res.status(401).json({ error: 'Tài khoản này được đăng ký qua Google. Vui lòng sử dụng nút "Đăng nhập với Google".' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email của bạn.' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const pair = await issueTokenPair(user, pickUA(req), pickIP(req));
    return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName }, ...pair });
}


async function refresh(req, res) {
    const token = req.body.refreshToken;
    if (!token) return res.status(400).json({ error: 'Missing refreshToken' });

    let decoded;
    try { decoded = verifyRefresh(token); } catch {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    if (user.status !== 'active') return res.status(403).json({ error: 'Account is not active' });

    try {
        const pair = await rotateRefreshToken(token, user, pickUA(req), pickIP(req));
        return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName }, ...pair });
    } catch (e) {
        return res.status(401).json({ error: e.message });
    }
}


async function logout(req, res) {
    const token = req.body.refreshToken;
    if (!token) return res.status(400).json({ error: 'Missing refreshToken' });

    try {
        const decoded = verifyRefresh(token);
        await revokeRefreshToken(token, decoded.sub);
    } catch {
        // ignore invalid token to prevent user enumeration
    }
    return res.json({ success: true });
}


async function me(req, res) {
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, fullName: true, status: true, lastLoginAt: true, authMethod: true } });
    return res.json({ user: u });
}


async function googleAuthCallback(req, res) {
    const user = req.user; 
    
    const frontendUrl = process.env.CORS_ORIGINS.split(',')[0].trim() || 'http://localhost:5173';

    if (!user) {
        return res.redirect(`${frontendUrl}/auth?error=auth_failed`);
    }

    const pair = await issueTokenPair(user, pickUA(req), pickIP(req));

    return res.redirect(
        `${frontendUrl}/auth/callback?accessToken=${pair.accessToken}&refreshToken=${pair.refreshToken}`
    );
}

/**
 * Gửi lại mã OTP xác thực
 */
async function resendVerification(req, res) {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Vui lòng cung cấp email.' });
    }

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
        // Trả về thành công giả để tránh lộ thông tin email nào đã đăng ký
        return res.json({ success: true, message: 'Nếu email của bạn tồn tại trong hệ thống, một mã xác thực mới đã được gửi.' });
    }

    if (user.status === 'active') {
        return res.status(400).json({ error: 'Tài khoản này đã được kích hoạt.' });
    }

    // Tạo và lưu OTP mới
    const newVerificationToken = generateOtp();
    await prisma.user.update({
        where: { id: user.id },
        data: { verificationToken: newVerificationToken }
    });

    // Gửi email với OTP mới
    // *** SỬA LỖI: Luôn sử dụng email đã chuẩn hóa để gửi mã OTP ***
    await sendVerificationEmail(normalizedEmail, newVerificationToken, user.fullName);

    return res.json({ success: true, message: 'Mã xác thực mới đã được gửi đến email của bạn.' });
}


module.exports = { 
    register, 
    login, 
    refresh, 
    logout, 
    me, 
    normalizeEmail, 
    googleAuthCallback,
    verifyOtp,
    resendVerification // *** THÊM DÒNG NÀY ***
};
