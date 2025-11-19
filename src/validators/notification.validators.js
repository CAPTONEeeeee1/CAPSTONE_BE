const { z } = require('zod');

const updateNotificationSettingsSchema = z.object({
    emailNotifications: z.boolean().optional(),
    taskAssignedEmail: z.boolean().optional(),
    workspaceInviteEmail: z.boolean().optional(),
    invitationResponseEmail: z.boolean().optional()
});

module.exports = {
    updateNotificationSettingsSchema
};
