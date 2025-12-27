const cron = require('node-cron');
const { prisma } = require('../shared/prisma');


async function deleteOldActivityLogs() {
  console.log(`[Cleanup Worker] Running job to delete activity logs older than 30 days at ${new Date().toISOString()}`);
  
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await prisma.activityLog.deleteMany({
      where: {
        createdAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    if (result.count > 0) {
      console.log(`[Cleanup Worker] Successfully deleted ${result.count} old activity log(s).`);
    } else {
      console.log(`[Cleanup Worker] No old activity logs to delete.`);
    }
  } catch (error) {
    console.error('[Cleanup Worker] Failed to delete old activity logs:', error);
  }
}


function scheduleActivityLogCleanup() {
  cron.schedule('0 0 * * *', deleteOldActivityLogs, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh" 
  });

  console.log('[Cron] Activity log cleanup worker scheduled to run daily at midnight.');
}

module.exports = {
  scheduleActivityLogCleanup,
  deleteOldActivityLogs
};
