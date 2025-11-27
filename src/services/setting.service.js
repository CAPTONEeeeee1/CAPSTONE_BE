const { prisma } = require('../shared/prisma');

/**
 * Get notification settings for a user.
 * If not exists, create default settings.
 * @param {string} userId
 * @returns {Promise<import('@prisma/client').NotificationSetting>}
 */
const getNotificationSettings = async (userId) => {
  let settings = await prisma.notificationSetting.findUnique({
    where: { userId },
  });

  if (!settings) {
    settings = await prisma.notificationSetting.create({
      data: {
        userId,
        emailNotifications: true,
        workspaceCreated: true,
        workspaceInvitations: true,
        workspaceInvitationResponse: true,
        boardCreated: true,
        boardDeleted: true,
        taskAssigned: true,
        inAppGroupingEnabled: true,
        emailDigestEnabled: true,
        emailDigestFrequency: 'DAILY',
      },
    });
  }

  return settings;
};

/**
 * Update notification settings for a user.
 * @param {string} userId
 * @param {object} data
 * @param {boolean} [data.emailNotifications]
 * @param {boolean} [data.workspaceCreated]
 * @param {boolean} [data.workspaceInvitations]
 * @param {boolean} [data.workspaceInvitationResponse]
 * @param {boolean} [data.boardCreated]
 * @param {boolean} [data.boardDeleted]
 * @param {boolean} [data.taskAssigned]
 * @param {boolean} [data.inAppGroupingEnabled]
 * @param {boolean} [data.emailDigestEnabled]
 * @param {import('@prisma/client').EmailDigestFrequency} [data.emailDigestFrequency]
 * @returns {Promise<import('@prisma/client').NotificationSetting>}
 */
const updateNotificationSettings = async (userId, data) => {
  console.log(`[Settings Update] User ID: ${userId}, Data:`, JSON.stringify(data, null, 2));
  const settings = await prisma.notificationSetting.update({
    where: { userId },
    data,
  });
  return settings;
};

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
};
