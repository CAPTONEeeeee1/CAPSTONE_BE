const jwt = require('jsonwebtoken');


const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRES = process.env.JWT_ACCESS_EXPIRES || '15m';
const REFRESH_EXPIRES_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRES_DAYS || '30', 10);


function signAccessToken(user) {
    const payload = { sub: user.id, email: user.email, name: user.fullName };
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
}


function signRefreshToken(user, jti) {
    const payload = { sub: user.id, jti };
    const expiresIn = `${REFRESH_EXPIRES_DAYS}d`;
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn });
}


function verifyAccess(token) {
    return jwt.verify(token, ACCESS_SECRET);
}


function verifyRefresh(token) {
    return jwt.verify(token, REFRESH_SECRET);
}


module.exports = { signAccessToken, signRefreshToken, verifyAccess, verifyRefresh, REFRESH_EXPIRES_DAYS };