const { prisma } = require('../shared/prisma');
const { hashPassword, verifyPassword } = require('../utils/hash');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  emailSchema,
  resetPasswordSchema,
  verifyOtpSchema
} = require('../validators/auth.validators');
const { verifyRefresh } = require('../utils/jwt');
const {
  issueTokenPair,
  rotateRefreshToken,
  revokeRefreshToken
} = require('../services/token.service');
const {
  createEmailVerification,
  resendVerificationEmail,
  verifyOTP,
  createPasswordResetRequest,
  resetPasswordWithCode
} = require('../services/verification.service');
const { logActivity, getClientInfo } = require('../services/activity.service');
const { sendEmail, getPasswordChangedEmailTemplate } = require('../services/email.service');

function pickUA(req) {
  return req.headers['user-agent'] || 'unknown';
}
function pickIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
}

function normalizeEmail(email) {
  if (!email) return email;
  const parts = email.split('@');
  if (parts.length !== 2 || parts[1].toLowerCase() !== 'gmail.com') return email.toLowerCase();
  const localPart = parts[0].replace(/\./g, '');
  return `${localPart}@${parts[1].toLowerCase()}`;
}

async function register(req, res) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  let { email, password, fullName, phone } = parsed.data;

  const normalizedEmail = normalizeEmail(email);

  const existedByEmail = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existedByEmail) return res.status(409).json({ error: 'Email đã được sử dụng.' });

  if (phone) {
    const existedByPhone = await prisma.user.findUnique({ where: { phone } });
    if (existedByPhone) return res.status(409).json({ error: 'Số điện thoại đã được đăng ký.' });
  }

  const passwordHash = await hashPassword(password);

  try {
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        fullName,
        phone,
        status: 'pending',
        authMethod: 'email',
      },
    });

    try {
      await createEmailVerification(user.id, user.email, user.fullName);
    } catch (error) {
      console.error("Failed to send verification email:", error.message);
    }

    return res.status(202).json({
      success: true,
      message: 'Đăng ký thành công! Vui lòng kiểm tra email để xác minh.',
      user: { id: user.id, email: user.email, fullName: user.fullName, status: 'pending' },
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0];
      if (field === 'email') return res.status(409).json({ error: 'Email đã được sử dụng' });
      if (field === 'phone') return res.status(409).json({ error: 'Số điện thoại đã được sử dụng' });
    }
    return res.status(500).json({ error: 'Đăng ký thất bại. Vui lòng thử lại.' });
  }
}

async function verifyEmail(req, res) {
  const parsed = verifyOtpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, otp } = parsed.data;

  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return res.status(404).json({ error: 'Người dùng không tồn tại.' });

  try {
    const verificationResult = await verifyOTP(user.id, otp);
    const verifiedUser = verificationResult.user;
    const pair = await issueTokenPair(verifiedUser, pickUA(req), pickIP(req));

    return res.json({
      success: true,
      message: 'Email đã được xác minh! Đang đăng nhập.',
      user: {
        id: verifiedUser.id,
        email: verifiedUser.email,
        fullName: verifiedUser.fullName,
        role: verifiedUser.role,
      },
      ...pair,
    });
  } catch (e) {
    console.error("OTP verification error:", e);
    return res.status(500).json({ error: 'Không thể xác minh tài khoản.' });
  }
}

async function resendVerification(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Vui lòng cung cấp email.' });
  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (!user || user.emailVerified)
    return res.json({
      success: true,
      message: 'Nếu email tồn tại, mã xác minh mới đã được gửi.',
    });

  await resendVerificationEmail(user.id);
  return res.json({ success: true, message: 'Mã xác minh mới đã được gửi đến email của bạn.' });
}

async function login(req, res) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  let { email, password } = parsed.data;

  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

  if (user.authMethod === 'google')
    return res.status(401).json({ error: 'Tài khoản này đăng ký qua Google.' });

  if (!user.emailVerified)
    return res.status(403).json({ error: 'Tài khoản chưa được kích hoạt.' });

  if (user.status === 'suspended')
    return res.status(403).json({
      error: 'Tài khoản của bạn đã bị khóa.',
      code: 'ACCOUNT_SUSPENDED',
    });

  if (user.status !== 'active')
    return res.status(403).json({ error: 'Tài khoản của bạn không hoạt động.' });


  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const clientInfo = getClientInfo(req);
  logActivity({ userId: user.id, action: 'user_login', ...clientInfo });

  const pair = await issueTokenPair(user, pickUA(req), pickIP(req));
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
    ...pair,
  });
}

async function refresh(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });

  try {
    const decoded = verifyRefresh(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.status !== 'active')
      return res.status(403).json({ error: 'Account is not active' });

    const pair = await rotateRefreshToken(refreshToken, user, pickUA(req), pickIP(req));
    return res.json({
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
    });
  } catch (e) {
    console.error('Refresh error:', e.message);
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
}

async function logout(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Missing refreshToken' });

  try {
    const decoded = verifyRefresh(refreshToken);
    await revokeRefreshToken(refreshToken, decoded.sub);

    logActivity({
      userId: decoded.sub,
      action: 'user_logout',
      ...getClientInfo(req),
    });
  } catch { }
  return res.json({ success: true });
}

async function me(req, res) {
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
      authMethod: true,
      emailVerified: true,
    },
  });
  return res.json({ user: u });
}

async function updateProfile(req, res) {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fullName, phone, avatar, description } = parsed.data;

  const updateData = {};
  if (fullName !== undefined) updateData.fullName = fullName;
  if (phone !== undefined) updateData.phone = phone || null;
  if (avatar !== undefined) updateData.avatar = avatar || null;
  if (description !== undefined) updateData.description = description || null;

  if (phone) {
    const existingUser = await prisma.user.findFirst({
      where: { phone, id: { not: req.user.id } },
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
      emailVerified: true,
    },
  });

  return res.json({ user: updated });
}

async function changePassword(req, res) {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { currentPassword, newPassword } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.authMethod === 'google')
    return res.status(400).json({ error: 'Tài khoản Google không thể đổi mật khẩu.' });

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });

  if (currentPassword === newPassword)
    return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu cũ' });

  const newHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: req.user.id }, data: { passwordHash: newHash } });

  try {
    console.log('🔐 Preparing to send password change notification email to:', user.email);

    const changeTime = new Date().toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const clientInfo = getClientInfo(req);
    const ipAddress = clientInfo.ip || req.ip || req.connection?.remoteAddress;
    const userAgent = req.get('user-agent');

    const emailHtml = getPasswordChangedEmailTemplate(
      user.fullName || user.email,
      changeTime,
      ipAddress,
      userAgent
    );

    const result = await sendEmail({
      to: user.email,
      subject: '🔐 Mật khẩu của bạn đã được thay đổi - PlanNex',
      html: emailHtml
    });
  } catch (emailError) {
    console.error('❌ Exception while sending password change notification email:', emailError);
  }

  return res.json({ message: 'Đổi mật khẩu thành công' });
}

async function sendResetCode(req, res) {
  const parsed = emailSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email } = parsed.data;

  const normalizedEmail = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (user) await createPasswordResetRequest(user.email);
  return res.json({
    success: true,
    message: 'Nếu email tồn tại, mã đặt lại mật khẩu đã được gửi.',
  });
}

async function resetPassword(req, res) {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, code, newPassword, confirmPassword } = parsed.data;

  if (newPassword !== confirmPassword)
    return res.status(400).json({ error: 'Xác nhận mật khẩu không khớp' });

  try {
    await resetPasswordWithCode(normalizeEmail(email), code, newPassword);
    return res.json({ success: true, message: 'Mật khẩu đã được đặt lại thành công' });
  } catch (error) {
    console.error('resetPassword error:', error);
    return res.status(400).json({ error: error.message || 'Đặt lại mật khẩu thất bại.' });
  }
}

async function googleAuthCallback(req, res) {
  const user = req.user;
  const frontendUrl =
    process.env.CORS_ORIGINS?.split(',')[0]?.trim() || 'http://localhost:5173';
  if (!user) return res.redirect(`${frontendUrl}/auth?error=auth_failed`);

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
  normalizeEmail,
};
