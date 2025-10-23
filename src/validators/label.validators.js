const { z } = require('zod');


const createLabelSchema = z.object({
    boardId: z.string().min(1),
    name: z.string().min(1),
    colorHex: z.string().regex(/^#([0-9a-fA-F]{6})$/)
});


module.exports = { createLabelSchema };