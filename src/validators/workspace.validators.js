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

const updateWorkspaceSchema = z.object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    visibility: z.enum(['private', 'public']).optional()
});

const updateMemberRoleSchema = z.object({
    role: z.enum(['admin', 'member', 'guest'])
});

module.exports = { createWorkspaceSchema, inviteMemberSchema, updateWorkspaceSchema, updateMemberRoleSchema };