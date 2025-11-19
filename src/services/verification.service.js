const { prisma } = require('../shared/prisma');
const { sendEmail, getOTPEmailTemplate, getPasswordResetCodeEmailTemplate } = require('./email.service');
const { hashPassword, verifyPassword } = require('../utils/hash');

const OTP_EXPIRES_MINUTES = parseInt(process.env.OTP_EXPIRES_MINUTES || '10', 10);


/**
 * Generate a 6-digit OTP
 */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Create email verification record and send OTP email
 */
async function createEmailVerification(userId, userEmail, userFullName) {
    const otp = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRES_MINUTES);

    // Delete old unverified OTPs
    await prisma.emailVerification.deleteMany({
        where: {
            userId,
            verifiedAt: null
        }
    });

    // Create new verification
    await prisma.emailVerification.create({
        data: {
            userId,
            otp,
            attempts: 0,
            expiresAt
        }
    });

    // Send OTP email
    const emailHtml = getOTPEmailTemplate(userFullName, otp);

    await sendEmail({
        to: userEmail,
        subject: 'Mã xác thực OTP - PlanNex',
        html: emailHtml
    });

    return { success: true };
}

/**
 * Verify OTP code
 */
async function verifyOTP(userId, otp) {
    const verification = await prisma.emailVerification.findFirst({
        where: {
            userId,
            verifiedAt: null
        },
        include: { user: true },
        orderBy: { createdAt: 'desc' }
    });

    if (!verification) {
        throw new Error('No verification request found');
    }

    if (new Date() > verification.expiresAt) {
        throw new Error('OTP expired. Please request a new one');
    }

    // Check max attempts (allow 5 tries)
    if (verification.attempts >= 5) {
        throw new Error('Too many failed attempts. Please request a new OTP');
    }

    // Check OTP match
    if (verification.otp !== otp) {
        // Increment failed attempts
        await prisma.emailVerification.update({
            where: { id: verification.id },
            data: { attempts: verification.attempts + 1 }
        });

        const remainingAttempts = 5 - (verification.attempts + 1);
        throw new Error(`Invalid OTP. ${remainingAttempts} attempts remaining`);
    }

    // Mark as verified
    await prisma.$transaction([
        prisma.emailVerification.update({
            where: { id: verification.id },
            data: { verifiedAt: new Date() }
        }),
        prisma.user.update({
            where: { id: verification.userId },
            data: {
                emailVerified: true,
                emailVerifiedAt: new Date(),
                status: 'active'
            }
        })
    ]);

    return { success: true, user: verification.user };
}

/**
 * Resend verification email
 */
async function resendVerificationEmail(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
        throw new Error('User not found');
    }

    if (user.emailVerified) {
        throw new Error('Email already verified');
    }

    return createEmailVerification(user.id, user.email, user.fullName);
}

async function createPasswordResetRequest(userEmail) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    
    if (!user) {
        throw new Error('User not found');
    }

    const resetCode = generateOTP();
    const codeHash = await hashPassword(resetCode);
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + OTP_EXPIRES_MINUTES);

    await prisma.passwordReset.deleteMany({
        where: {
            userId: user.id
        }
    });

    await prisma.passwordReset.create({
        data: {
            userId: user.id,
            codeHash,
            attempts: 0,
            expiresAt
        }
    });

    const emailHtml = getPasswordResetCodeEmailTemplate(user.fullName || 'User', resetCode);
    
    await sendEmail({
        to: user.email,
        subject: '🔑 Reset Password Code - PlanNex',
        html: emailHtml
    });

    return { success: true };
}

async function resetPasswordWithCode(userEmail, code, newPassword) {
    const user = await prisma.user.findUnique({ where: { email: userEmail } });
    
    if (!user) {
        throw new Error('User not found');
    }

    const reset = await prisma.passwordReset.findFirst({
        where: {
            userId: user.id,
            usedAt: null
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!reset) {
        throw new Error('No password reset request found');
    }

    if (new Date() > reset.expiresAt) {
        throw new Error('Reset code expired. Please request a new one');
    }

    if (reset.attempts >= 5) {
        throw new Error('Too many failed attempts. Please request a new reset code');
    }

    const isValidCode = await verifyPassword(code, reset.codeHash);
    if (!isValidCode) {
        await prisma.passwordReset.update({
            where: { id: reset.id },
            data: { attempts: reset.attempts + 1 }
        });

        const remainingAttempts = 5 - (reset.attempts + 1);
        throw new Error(`Invalid reset code. ${remainingAttempts} attempts remaining`);
    }

    const newPasswordHash = await hashPassword(newPassword);

    await prisma.$transaction([
        prisma.passwordReset.update({
            where: { id: reset.id },
            data: { usedAt: new Date() }
        }),
        prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: newPasswordHash }
        })
    ]);

    return { success: true };
}

module.exports = {
    createEmailVerification,
    verifyOTP,
    resendVerificationEmail,
    createPasswordResetRequest,
    resetPasswordWithCode
};
