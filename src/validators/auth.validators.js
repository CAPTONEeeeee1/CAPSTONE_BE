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

const updateProfileSchema = z.object({
    fullName: z.string().min(1).optional(),
    phone: z.string().min(8).max(20).optional().nullable(),
    avatar: z.string().url().optional().nullable(),
    description: z.string().max(500).optional().nullable()
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(6, "Current password must be at least 6 characters"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Confirm password must be at least 6 characters")
})
.refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirm password do not match",
    path: ["confirmPassword"]
})
.refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from current password",
    path: ["newPassword"]
});

const emailSchema = z.object({
    email: z.string().trim().email("Invalid email format")
});

const resetPasswordSchema = z.object({
    email: z.string().trim().email("Invalid email format"),
    code: z.string().regex(/^\d{6}$/, "Code must be exactly 6 digits"),
    newPassword: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(6, "Confirm password must be at least 6 characters")
})
.refine((data) => data.newPassword === data.confirmPassword, {
    message: "New password and confirm password do not match",
    path: ["confirmPassword"]
});

module.exports = { registerSchema, loginSchema, updateProfileSchema, changePasswordSchema, emailSchema, resetPasswordSchema };