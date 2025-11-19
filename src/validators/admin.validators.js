const { z } = require('zod');

const updateUserStatusSchema = z.object({
    status: z.enum(['active', 'suspended', 'pending'])
});

const updateUserRoleSchema = z.object({
    role: z.enum(['user', 'admin'])
});

module.exports = {
    updateUserStatusSchema,
    updateUserRoleSchema
};
