const { z } = require('zod');


const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    fullName: z.string().min(1),
    phone: z.string().min(8).max(20).optional()
});


const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(6)
});


module.exports = { registerSchema, loginSchema };