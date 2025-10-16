const { z } = require('zod');


const createWorkspaceSchema = z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    visibility: z.enum(['private', 'public']).optional()
});


module.exports = { createWorkspaceSchema };