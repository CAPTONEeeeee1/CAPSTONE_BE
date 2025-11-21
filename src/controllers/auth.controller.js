const { prisma } = require('../shared/prisma');
const { hashPassword, verifyPassword } = require('../utils/hash');
// Hợp nhất tất cả các schema validators
const { registerSchema, loginSchema, updateProfileSchema, changePasswordSchema, emailSchema, resetPasswordSchema, verifyOtpSchema } = require('../validators/auth.validators'); 
const { verifyRefresh } = require('../utils/jwt');
const { issueTokenPair, rotateRefreshToken, revokeRefreshToken } = require('../services/token.service');
// SỬA LỖI: Import đúng service để gửi email OTP và xác thực
const { createEmailVerification, resendVerificationEmail, createPasswordResetRequest, verifyOTP } = require('../services/verification.service');
const { logActivity, getClientInfo } = require('../services/activity.service'); 


function pickUA(req) { return req.headers['user-agent'] || 'unknown'; }
function pickIP(req) { return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress; }


// --- HÀM HỖ TRỢ (Từ Code 2) ---

/**
 * Chuẩn hóa email Gmail (loại bỏ dấu chấm) và chuyển thành chữ thường
 */
function normalizeEmail(email) {
    if (!email) return email;

    const parts = email.split('@');
    // Chỉ chuẩn hóa nếu là gmail.com
    if (parts.length !== 2 || parts[1].toLowerCase() !== 'gmail.com') {
        return email.toLowerCase(); // Chuẩn hóa chữ thường cho tất cả email
    }

    const localPart = parts[0].replace(/\./g, '');
    return `${localPart}@${parts[1].toLowerCase()}`;
}

// --- CHỨC NĂNG AUTHENTICATION ---

async function register(req, res) {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    let { email, password, fullName, phone } = parsed.data;

    const normalizedEmail = normalizeEmail(email);

    // 1. KIỂM TRA EMAIL ĐÃ CHUẨN HÓA
    const existedByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existedByEmail) return res.status(409).json({ error: 'Email đã được sử dụng. Vui lòng sử dụng email khác.' });

    // 2. KIỂM TRA PHONE (Nếu được cung cấp)
    if (phone) {
        const existedByPhone = await prisma.user.findUnique({ where: { phone } });
        if (existedByPhone) return res.status(409).json({ error: 'Số điện thoại đã được đăng ký cho tài khoản khác.' });
    }

    const passwordHash = await hashPassword(password);

    try {
        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                passwordHash,
                fullName,
                phone,
                status: 'pending', // Trạng thái chờ kích hoạt
                authMethod: 'email', // Từ Code 2, cần thiết cho Google Auth check
            }
        });

        // Gửi email xác minh (sử dụng sendVerificationEmail từ Code 2)
        try {
            // SỬA LỖI: Gọi đúng hàm createEmailVerification để tạo và gửi OTP
            await createEmailVerification(user.id, user.email, user.fullName);
        } catch (error) {
            console.error("Failed to send verification email:", error.message);
            // Vẫn tiếp tục nếu gửi email thất bại
        }

        // Trả về 202 để chuyển sang giao diện OTP (theo Code 2)
        return res.status(202).json({ 
            success: true,
            message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác minh tài khoản.',
            user: { id: user.id, email: user.email, fullName: user.fullName, status: 'pending' }
        });
    } catch (error) {
        console.error('Registration error:', error);

        // Xử lý lỗi trùng lặp Prisma (giữ logic Code 1)
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0];
            if (field === 'email') return res.status(409).json({ error: 'Email đã được sử dụng' });
            if (field === 'phone') return res.status(409).json({ error: 'Số điện thoại đã được sử dụng' });
        }

        return res.status(500).json({ error: 'Đăng ký thất bại. Vui lòng thử lại.' });
    }
}

async function verifyEmail(req, res) {
    const parsed = verifyOtpSchema.safeParse(req.body); // Dùng verifyOtpSchema từ Code 2
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, otp } = parsed.data; // Logic dùng email và otp (Code 2)

    const normalizedEmail = normalizeEmail(email);

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
        return res.status(404).json({ error: 'Người dùng không tồn tại.' });
    }

    try {
        // SỬA LỖI: Gọi hàm verifyOTP từ service để kiểm tra OTP
        const verificationResult = await verifyOTP(user.id, otp);

        const verifiedUser = verificationResult.user;

        // Tự động đăng nhập và cấp token (Cải tiến từ Code 2)
        const pair = await issueTokenPair(verifiedUser, pickUA(req), pickIP(req));
        
        return res.json({ 
            success: true, 
            message: 'Email đã được xác minh thành công! Đang đăng nhập.', 
            user: { id: verifiedUser.id, email: verifiedUser.email, fullName: verifiedUser.fullName, role: verifiedUser.role },
            ...pair 
        });

    } catch (e) {
        console.error("Prisma update failed during OTP verification:", e);
        return res.status(500).json({ error: 'Lỗi máy chủ: Không thể kích hoạt tài khoản. Vui lòng thử lại.' });
    }
}

async function resendVerification(req, res) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Vui lòng cung cấp email.' });

    const normalizedEmail = normalizeEmail(email);
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || user.emailVerified) {
        // Trả về thành công giả/lỗi đã verified (Thực hành tốt)
        if (user && user.emailVerified) return res.status(400).json({ error: 'Email đã được xác minh.' });
        return res.json({ success: true, message: 'Nếu email của bạn tồn tại trong hệ thống, một mã xác thực mới đã được gửi.' });
    }

    // Gửi email với OTP mới
    // SỬA LỖI: Gọi đúng hàm resendVerificationEmail
    await resendVerificationEmail(user.id);

    return res.json({ success: true, message: 'Mã xác thực mới đã được gửi đến email của bạn.' });
}


async function login(req, res) {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    let { email, password } = parsed.data;

    const normalizedEmail = normalizeEmail(email);
    
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' }); // Thông báo chung chung
    
    // Kiểm tra đăng nhập Google
    if (user.authMethod === 'google') return res.status(401).json({ error: 'Tài khoản này được đăng ký qua Google. Vui lòng sử dụng nút "Đăng nhập với Google".' });
    
    // Kiểm tra xác minh email và trạng thái
    if (!user.emailVerified || user.status !== 'active') {
        return res.status(403).json({
            error: 'Tài khoản chưa được kích hoạt hoặc không hoạt động',
            code: 'EMAIL_NOT_VERIFIED',
            userId: user.id,
            email: user.email
        });
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' }); // Thông báo chung chung

    // Cập nhật lastLoginAt
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    // Ghi Activity Log (Giữ lại từ Code 1)
    const clientInfo = getClientInfo(req);
    logActivity({
        userId: user.id,
        action: 'user_login',
        ...clientInfo
    });

    const pair = await issueTokenPair(user, pickUA(req), pickIP(req));
    return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, ...pair });
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
    
    // Đảm bảo chỉ active user mới được refresh token (Thêm từ Code 2)
    if (user.status !== 'active') return res.status(403).json({ error: 'Account is not active' });

    try {
        const pair = await rotateRefreshToken(token, user, pickUA(req), pickIP(req));
        return res.json({ user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }, ...pair });
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
        
        // Ghi Activity Log (Giữ lại từ Code 1)
        const clientInfo = getClientInfo(req);
        logActivity({
            userId: decoded.sub,
            action: 'user_logout',
            ...clientInfo
        });
    } catch {
        // ignore invalid token to prevent user enumeration
    }
    return res.json({ success: true });
}


async function me(req, res) {
    // Giữ lại select chi tiết từ Code 1 và bổ sung authMethod
    const u = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            avatar: true,
            description: true,
            role: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
            authMethod: true, // Thêm trường này
            emailVerified: true // Thêm trường này
        }
    });
    return res.json({ user: u });
}

async function updateProfile(req, res) {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { fullName, phone, avatar, description } = parsed.data;

    const updateData = {};
    if (fullName !== undefined) updateData.fullName = fullName;
    if (phone !== undefined) updateData.phone = phone === null ? null : phone;
    if (avatar !== undefined) updateData.avatar = avatar === null ? null : avatar;
    if (description !== undefined) updateData.description = description === null ? null : description;

    // Kiểm tra trùng lặp số điện thoại
    if (phone && phone !== null) {
        const existingUser = await prisma.user.findFirst({
            where: { phone, id: { not: req.user.id } }
        });
        if (existingUser) return res.status(400).json({ error: 'Số điện thoại đã được sử dụng' });
    }

    const updated = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
        select: {
            id: true,
            email: true,
            fullName: true,
            phone: true,
            avatar: true,
            description: true,
            status: true,
            lastLoginAt: true,
            createdAt: true,
            updatedAt: true,
            emailVerified: true
        }
    });

    return res.json({ user: updated });
}

async function changePassword(req, res) {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { currentPassword, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Ngăn chặn đổi mật khẩu nếu đăng ký bằng Google
    if (user.authMethod === 'google') {
        return res.status(400).json({ error: 'Tài khoản được đăng ký qua Google và không thể thay đổi mật khẩu trực tiếp.' });
    }

    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
        return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
    }

    if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu hiện tại' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    await prisma.user.update({
        where: { id: req.user.id },
        data: { passwordHash: newPasswordHash }
    });

    return res.json({ message: 'Đổi mật khẩu thành công' });
}


// --- QUÊN MẬT KHẨU (Sử dụng OTP 6 số) ---

async function sendResetCode(req, res) {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email } = parsed.data;
    
    const normalizedEmail = normalizeEmail(email);

    try {
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        // Trả về thành công giả để tránh lộ thông tin email (Thực hành tốt)
        if (!user) {
             return res.json({ success: true, message: 'Mã đặt lại đã được gửi, vui lòng kiểm tra email' });
        }
        
        // Tạo và lưu mã reset mới (dùng lại trường verificationToken)
        const resetCode = generateOtp();
        await prisma.user.update({
            where: { id: user.id },
            data: { verificationToken: resetCode }
        });

        // Gửi email reset
        // SỬA LỖI: Gọi đúng hàm createPasswordResetRequest
        await createPasswordResetRequest(user.email);

        return res.json({
            success: true,
            message: 'Mã đặt lại mật khẩu đã được gửi, vui lòng kiểm tra email'
        });
    } catch (error) {
        console.error('sendResetCode error:', error);
        return res.status(500).json({ error: 'Lỗi gửi mã đặt lại. Vui lòng thử lại.' });
    }
}

async function resetPassword(req, res) {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, code, newPassword, confirmPassword } = parsed.data;
    
    const normalizedEmail = normalizeEmail(email);

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Xác nhận mật khẩu không khớp' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

        if (!user) return res.status(400).json({ error: 'Email không tồn tại.' });
        
        // Kiểm tra mã reset (OTP)
        if (user.verificationToken !== code.toString() || !user.verificationToken) {
            return res.status(401).json({ error: 'Mã đặt lại không hợp lệ hoặc đã hết hạn.' });
        }

        // Hash mật khẩu mới và cập nhật
        const newPasswordHash = await hashPassword(newPassword);
        await prisma.user.update({
            where: { id: user.id },
            data: { 
                passwordHash: newPasswordHash,
                verificationToken: null, // Xóa mã reset sau khi dùng
            }
        });

        return res.json({
            success: true,
            message: 'Mật khẩu đã được đặt lại thành công'
        });
    } catch (error) {
        console.error('resetPassword error:', error);
        return res.status(500).json({ error: 'Lỗi đặt lại mật khẩu. Vui lòng thử lại.' });
    }
}


// --- ĐĂNG NHẬP GOOGLE (Từ Code 2) ---

async function googleAuthCallback(req, res) {
    const user = req.user; 
    
    const frontendUrl = process.env.CORS_ORIGINS?.split(',')[0]?.trim() || 'http://localhost:5173';

    if (!user) {
        return res.redirect(`${frontendUrl}/auth?error=auth_failed`);
    }

    const pair = await issueTokenPair(user, pickUA(req), pickIP(req));

    return res.redirect(
        `${frontendUrl}/auth/callback?accessToken=${pair.accessToken}&refreshToken=${pair.refreshToken}`
    );
}

module.exports = { 
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
    normalizeEmail 
};