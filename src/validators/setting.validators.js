const { z } = require('zod');

const updateSettingsValidator = z.object({
  body: z.object({
    emailNotifications: z.boolean().optional(),
    workspaceCreated: z.boolean().optional(),
    workspaceInvitations: z.boolean().optional(),
    workspaceInvitationResponse: z.boolean().optional(),
    boardCreated: z.boolean().optional(),
    boardDeleted: z.boolean().optional(),
    taskAssigned: z.boolean().optional(),
    inAppGroupingEnabled: z.boolean().optional(),
    emailDigestEnabled: z.boolean().optional(),
    emailDigestFrequency: z.enum(['HOURLY', 'DAILY', 'WEEKLY', 'NEVER']).optional(),
  }),
});

module.exports = {
  updateSettingsValidator,
};
