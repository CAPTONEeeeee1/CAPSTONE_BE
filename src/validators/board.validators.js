const { z } = require('zod');


const createBoardSchema = z.object({
    workspaceId: z.string().min(1),
    name: z.string().min(1),
    mode: z.enum(['private', 'workspace', 'public']).optional(),
    keySlug: z.string().max(16).optional()
});

const renameBoardSchema = z.object({
    name: z.string().min(1)
});

module.exports = { createBoardSchema, renameBoardSchema };