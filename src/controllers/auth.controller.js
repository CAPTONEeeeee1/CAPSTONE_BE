const { prisma } = require('../shared/prisma');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { registerSchema, loginSchema, updateProfileSchema, changePasswordSchema, emailSchema, resetPasswordSchema } = require('../validators/auth.validators');
const { verifyRefresh } = require('../utils/jwt');
const { issueTokenPair, rotateRefreshToken, revokeRefreshToken } = require('../services/token.service');
const { createEmailVerification, verifyOTP, resendVerificationEmail, createPasswordResetRequest, resetPasswordWithCode } = require('../services/verification.service');
const { logActivity, getClientInfo } = require('../services/activity.service');


function pickUA(req) { return req.headers['user-agent'] || 'unknown'; }
function pickIP(req) { return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress; }


async function register(req, res) {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password, fullName, phone } = parsed.data;

    // Check if email exists
    const existedEmail = await prisma.user.findUnique({ where: { email } });
    if (existedEmail) return res.status(409).json({ error: 'Email already in use' });

    // Check if phone exists (if phone is provided)
    if (phone) {
        const existedPhone = await prisma.user.findUnique({ where: { phone } });
        if (existedPhone) return res.status(409).json({ error: 'Phone number already in use' });
    }

    const passwordHash = await hashPassword(password);

    try {
        const user = await prisma.user.create({
            data: {
                email,
                passwordHash,
                fullName,
                phone,
                status: 'pending', // User starts as pending until email verified
                emailVerified: false
            }
        });

        // Send verification email
        try {
            await createEmailVerification(user.id, user.email, user.fullName);
        } catch (error) {
            console.error('Failed to send verification email:', error);
            // Don't fail registration if email fails
        }

        // Don't issue tokens yet - user needs to verify email first
        return res.status(201).json({
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                emailVerified: false,
                status: 'pending'
            },
            message: 'Registration successful! Please check your email to verify your account.'
        });
    } catch (error) {
        console.error('Registration error:', error);

        // Handle Prisma unique constraint errors
        if (error.code === 'P2002') {
            const field = error.meta?.target?.[0];
            if (field === 'email') {
                return res.status(409).json({ error: 'Email already in use' });
            } else if (field === 'phone') {
                return res.status(409).json({ error: 'Phone number already in use' });
            }
        }

        return res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
}


async function login(req, res) {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;


    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    // Check email verification
    if (!user.emailVerified) {
        return res.status(403).json({
            error: 'Email not verified',
            code: 'EMAIL_NOT_VERIFIED',
            userId: user.id,
            email: user.email
        });
    }

    if (user.status !== 'active') return res.status(403).json({ error: 'Account is not active' });


    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });


    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

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
    // populated by auth middleware
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
            updatedAt: true
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

    if (phone && phone !== null) {
        const existingUser = await prisma.user.findFirst({
            where: { phone, id: { not: req.user.id } }
        });
        if (existingUser) return res.status(400).json({ error: 'Phone number already in use' });
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
            updatedAt: true
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

    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (currentPassword === newPassword) {
        return res.status(400).json({ error: 'New password must be different from current password' });
    }

    const newPasswordHash = await hashPassword(newPassword);
    await prisma.user.update({
        where: { id: req.user.id },
        data: { passwordHash: newPasswordHash }
    });

    return res.json({ message: 'Password changed successfully' });
}

async function verifyEmail(req, res) {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
        return res.status(400).json({ error: 'User ID and OTP are required' });
    }

    try {
        const result = await verifyOTP(userId, otp);
        return res.json({
            success: true,
            message: 'Email verified successfully! You can now login.',
            user: {
                id: result.user.id,
                email: result.user.email,
                fullName: result.user.fullName,
                emailVerified: true
            }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function resendVerification(req, res) {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ error: 'Email already verified' });
        }

        await resendVerificationEmail(user.id);

        return res.json({
            success: true,
            message: 'Verification email sent successfully! Please check your inbox.'
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function sendResetCode(req, res) {
    const parsed = emailSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email } = parsed.data;

    try {
        await createPasswordResetRequest(email);
        return res.json({
            success: true,
            message: 'Reset code has been sent, please check your email'
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function resetPassword(req, res) {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, code, newPassword, confirmPassword } = parsed.data;

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Confirm password not matched' });
    }



    try {
        await resetPasswordWithCode(email, code, newPassword);
        return res.json({
            success: true,
            message: 'Password reset successfully'
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

module.exports = { register, login, refresh, logout, me, updateProfile, changePassword, verifyEmail, resendVerification, sendResetCode, resetPassword };