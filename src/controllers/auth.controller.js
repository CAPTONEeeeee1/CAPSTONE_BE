const { prisma } = require('../shared/prisma');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { registerSchema, loginSchema } = require('../validators/auth.validators');
const { verifyRefresh } = require('../utils/jwt');
const { issueTokenPair, rotateRefreshToken, revokeRefreshToken } = require('../services/token.service');


function pickUA(req) { return req.headers['user-agent'] || 'unknown'; }
function pickIP(req) { return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress; }


async function register(req, res) {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password, fullName, phone } = parsed.data;


    const existed = await prisma.user.findUnique({ where: { email } });
    if (existed) return res.status(409).json({ error: 'Email already in use' });


    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { email, passwordHash, fullName, phone } });


    const pair = await issueTokenPair(user, pickUA(req), pickIP(req));
    return res.status(201).json({ user: { id: user.id, email: user.email, fullName: user.fullName }, ...pair });
}


async function login(req, res) {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { email, password } = parsed.data;


    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account is not active' });


    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });


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
    // populated by auth middleware
    const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { id: true, email: true, fullName: true, status: true, lastLoginAt: true } });
    return res.json({ user: u });
}


module.exports = { register, login, refresh, logout, me };