const { prisma } = require('../shared/prisma');
const { sendEmail, getOTPEmailTemplate } = require('./email.service');

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
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes

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

    if (verification.verifiedAt) {
        throw new Error('Email already verified');
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

module.exports = {
    createEmailVerification,
    verifyOTP,
    resendVerificationEmail
};
