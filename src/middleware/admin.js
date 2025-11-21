const { prisma } = require('../shared/prisma');

async function requireAdmin(req, res, next) {
    if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { role: true, status: true }
    });

    if (!user || user.status !== 'active') {
        return res.status(403).json({ error: 'Account not active' });
    }

    if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    next();
}

module.exports = { requireAdmin };
