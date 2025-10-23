const { z } = require('zod');


const createListSchema = z.object({
    boardId: z.string().min(1),
    name: z.string().min(1)
});


const reorderListsSchema = z.object({
    boardId: z.string().min(1),
    orders: z.array(z.object({ id: z.string().min(1), orderIdx: z.number().int().nonnegative() }))
});


module.exports = { createListSchema, reorderListsSchema };