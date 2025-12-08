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

module.exports = {
    logActivity
};
