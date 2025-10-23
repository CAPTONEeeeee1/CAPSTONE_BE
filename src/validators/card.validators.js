const { z } = require('zod');


const createCardSchema = z.object({
    boardId: z.string().min(1),
    listId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    dueDate: z.string().datetime().optional(),
    startDate: z.string().datetime().optional(),
    assigneeIds: z.array(z.string().min(1)).optional(),
    labelIds: z.array(z.string().min(1)).optional(),
    custom: z.any().optional()
});


const updateCardSchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    dueDate: z.string().datetime().optional(),
    startDate: z.string().datetime().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    listId: z.string().optional(),
    orderIdx: z.number().int().optional(),
    custom: z.any().optional()
});


const moveCardSchema = z.object({
    toListId: z.string().min(1),
    toIndex: z.number().int().nonnegative()
});


module.exports = { createCardSchema, updateCardSchema, moveCardSchema };