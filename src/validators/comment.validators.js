const { z } = require('zod');


const createCommentSchema = z.object({ bodyMd: z.string().min(1) });
const updateCommentSchema = z.object({ bodyMd: z.string().min(1) });


module.exports = { createCommentSchema, updateCommentSchema };