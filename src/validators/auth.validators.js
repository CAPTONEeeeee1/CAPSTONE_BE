const { z } = require('zod');

// --- SCHEMAS CHÍNH

const registerSchema = z.object({
    email: z.string()
        .email({ message: "Email không hợp lệ." })
        .toLowerCase()
        .trim(),
    password: z.string()
        .min(8, { message: "Mật khẩu phải có ít nhất 8 ký tự" })
        .max(15, { message: "Mật khẩu không được vượt quá 15 ký tự" })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,15}$/, {
            message: "Mật khẩu phải chứa ít nhất một chữ thường, một chữ hoa, một số và một ký tự đặc biệt (@$!%*?&)"
        }),
    fullName: z.string().min(1, { message: "Họ và tên không được để trống" }),
    phone: z.string().min(8).max(20).optional()
});

const loginSchema = z.object({
    email: z.string()
        .email({ message: "Email không hợp lệ." })
        .toLowerCase()
        .trim(),
    password: z.string().min(8, { message: "Mật khẩu phải có ít nhất 8 ký tự" })
});

// --- SCHEMAS XÁC MINH/RESET PASSWORD ---

const emailSchema = z.object({
    email: z.string()
        .email({ message: "Email không hợp lệ." })
        .toLowerCase()
        .trim()
});

const verifyOtpSchema = z.object({
    email: z.string()
        .email({ message: "Email không hợp lệ." })
        .toLowerCase()
        .trim(),
    otp: z.string()
        .length(6, { message: "Mã OTP phải có 6 chữ số." })
        .regex(/^[0-9]+$/, { message: "Mã OTP chỉ được chứa chữ số." })
});

const resetPasswordSchema = z.object({
    email: z.string()
        .email({ message: "Email không hợp lệ." })
        .toLowerCase()
        .trim(),
    code: z.string()
        .length(6, { message: "Mã đặt lại phải có 6 chữ số." })
        .regex(/^[0-9]+$/, { message: "Mã đặt lại chỉ được chứa chữ số." }),
    newPassword: z.string()
        .min(8, { message: "Mật khẩu phải có ít nhất 8 ký tự" })
        .max(15, { message: "Mật khẩu không được vượt quá 15 ký tự" })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,15}$/, {
            message: "Mật khẩu phải chứa ít nhất một chữ thường, một chữ hoa, một số và một ký tự đặc biệt (@$!%*?&)"
        }),
    confirmPassword: z.string()
        .min(8, { message: "Mật khẩu phải có ít nhất 8 ký tự" })
        .max(15, { message: "Mật khẩu không được vượt quá 15 ký tự" })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,15}$/, {
            message: "Mật khẩu phải chứa ít nhất một chữ thường, một chữ hoa, một số và một ký tự đặc biệt (@$!%*?&)"
        })
})
.refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu mới và xác nhận mật khẩu không khớp",
    path: ["confirmPassword"]
});

// --- SCHEMAS QUẢN LÝ HỒ SƠ ---

const updateProfileSchema = z.object({
    fullName: z.string().min(1, { message: "Họ và tên không được để trống" }).optional(),
    phone: z.string().min(8).max(20).optional().nullable(),
    avatar: z.string().url("URL Avatar không hợp lệ").optional().nullable(),
    description: z.string().max(500, "Mô tả không được vượt quá 500 ký tự").optional().nullable()
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(8, "Mật khẩu hiện tại phải có ít nhất 8 ký tự"),
    newPassword: z.string()
        .min(8, { message: "Mật khẩu phải có ít nhất 8 ký tự" })
        .max(15, { message: "Mật khẩu không được vượt quá 15 ký tự" })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,15}$/, {
            message: "Mật khẩu phải chứa ít nhất một chữ thường, một chữ hoa, một số và một ký tự đặc biệt (@$!%*?&)"
        }),
    confirmPassword: z.string()
        .min(8, { message: "Mật khẩu phải có ít nhất 8 ký tự" })
        .max(15, { message: "Mật khẩu không được vượt quá 15 ký tự" })
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,15}$/, {
            message: "Mật khẩu phải chứa ít nhất một chữ thường, một chữ hoa, một số và một ký tự đặc biệt (@$!%*?&)"
        })
})
.refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu mới và xác nhận mật khẩu không khớp",
    path: ["confirmPassword"]
})
.refine((data) => data.newPassword !== data.currentPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại",
    path: ["newPassword"]
});

module.exports = { 
    registerSchema, 
    loginSchema, 
    verifyOtpSchema,
    updateProfileSchema, 
    changePasswordSchema, 
    emailSchema, 
    resetPasswordSchema 
};
