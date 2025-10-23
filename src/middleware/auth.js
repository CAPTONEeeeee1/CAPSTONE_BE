const { verifyAccess } = require('../utils/jwt');


function auth(required = true) {
    return (req, res, next) => {
        const header = req.headers['authorization'] || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;


        if (!token) {
            if (required) return res.status(401).json({ error: 'Missing token' });
            return next();
        }
        try {
            const decoded = verifyAccess(token);
            req.user = { id: decoded.sub, email: decoded.email, name: decoded.name };
            next();
        } catch (e) {
            return res.status(401).json({ error: 'Invalid/expired token' });
        }
    };
}


module.exports = { auth };