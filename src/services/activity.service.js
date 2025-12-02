const { prisma } = require('../shared/prisma');

function runInBackground(asyncFn) {
    asyncFn().catch(err => {
        console.error('[Activity Log Error]:', err.message);
    });
}

async function logActivity({ userId, action, entityType = null, entityId = null, entityName = null, metadata = null, ipAddress = null, userAgent = null }) {
    if (!userId || !action) {
        console.warn('Invalid activity log attempt: userId or action is missing.');
        return;
    }

    runInBackground(async () => {
        await prisma.activityLog.create({
            data: {
                userId,
                action,
                entityType,
                entityId,
                entityName,
                metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : null,
                ipAddress,
                userAgent
            }
        });
    });
}

function getClientInfo(req) {
    return {
        ipAddress: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null
    };
}

module.exports = {
    logActivity,
    getClientInfo
};
