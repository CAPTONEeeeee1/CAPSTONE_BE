const { z } = require('zod');


const createWorkspaceSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    visibility: z.enum(['private', 'public']).optional()
});

const inviteMemberSchema = z.object({
    email: z.string().email(),
    role: z.enum(['admin', 'member', 'guest']).optional()
});

module.exports = { createWorkspaceSchema, inviteMemberSchema };