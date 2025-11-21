const crypto = require('crypto');
const { prisma } = require('../shared/prisma');
const { signAccessToken, signRefreshToken, REFRESH_EXPIRES_DAYS } = require('../utils/jwt');


/**

 * @param {string} s
 * @returns {string} 
 */
function sha256(s) { 
    return crypto.createHash('sha256').update(s).digest('hex'); 
}

/**
 * Tạo cặp Access Token và Refresh Token mới, đồng thời lưu Refresh Token vào DB.
 * @param {object} user - Thông tin người dùng.
 * @param {string} ua - User Agent (từ request header).
 * @param {string} ip - Địa chỉ IP của người dùng.
 * @returns {object} { accessToken, refreshToken, expiresAt }
 */
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

/**
 * Thu hồi Refresh Token cũ và phát hành cặp token mới (Token Rotation).
 * @param {string} currentToken - Refresh Token hiện tại.
 * @param {object} user - Thông tin người dùng.
 * @param {string} ua - User Agent.
 * @param {string} ip - Địa chỉ IP.
 * @returns {object} { accessToken, refreshToken, expiresAt }
 */
async function rotateRefreshToken(currentToken, user, ua, ip) {
    const hash = sha256(currentToken);
    
    // 1. Tìm token chưa bị thu hồi và chưa hết hạn
    const token = await prisma.refreshToken.findFirst({ 
        where: { tokenHash: hash, userId: user.id, revokedAt: null } 
    });
    
    if (!token) throw new Error('Refresh token not found');
    if (token.expiresAt < new Date()) throw new Error('Refresh token expired');

    // 2. Thu hồi token hiện tại (Revoke current token)
    await prisma.refreshToken.update({ 
        where: { id: token.id }, 
        data: { revokedAt: new Date() } 
    });

    // 3. Phát hành cặp token mới và lưu vào DB
    return issueTokenPair(user, ua, ip);
}

/**
 * Thu hồi tất cả các phiên bản của một Refresh Token (khi người dùng đăng xuất).
 * @param {string} tokenStr - Refresh Token cần thu hồi.
 * @param {number} userId - ID người dùng.
 */
async function revokeRefreshToken(tokenStr, userId) {
    const hash = sha256(tokenStr);
    // Thu hồi tất cả các token khớp với hash và chưa bị thu hồi
    await prisma.refreshToken.updateMany({ 
        where: { userId, tokenHash: hash, revokedAt: null }, 
        data: { revokedAt: new Date() } 
    });
}


module.exports = { issueTokenPair, rotateRefreshToken, revokeRefreshToken };