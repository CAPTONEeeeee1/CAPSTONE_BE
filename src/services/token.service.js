const crypto = require('crypto');
const { prisma } = require('../shared/prisma');
const { signAccessToken, signRefreshToken, REFRESH_EXPIRES_DAYS } = require('../utils/jwt');


function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }


async function issueTokenPair(user, ua, ip) {
    const jti = crypto.randomUUID();
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user, jti);


    const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);


    await prisma.refreshToken.create({
        data: {
            userId: user.id,
            tokenHash: sha256(refreshToken),
            userAgent: ua,
            ipAddress: ip,
            expiresAt
        }
    });


    return { accessToken, refreshToken, expiresAt };
}


async function rotateRefreshToken(currentToken, user, ua, ip) {
    const hash = sha256(currentToken);
    const token = await prisma.refreshToken.findFirst({ where: { tokenHash: hash, userId: user.id, revokedAt: null } });
    if (!token) throw new Error('Refresh token not found');
    if (token.expiresAt < new Date()) throw new Error('Refresh token expired');


    // revoke current
    await prisma.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date() } });


    // new pair
    return issueTokenPair(user, ua, ip);
}


async function revokeRefreshToken(tokenStr, userId) {
    const hash = sha256(tokenStr);
    await prisma.refreshToken.updateMany({ where: { userId, tokenHash: hash, revokedAt: null }, data: { revokedAt: new Date() } });
}


module.exports = { issueTokenPair, rotateRefreshToken, revokeRefreshToken };