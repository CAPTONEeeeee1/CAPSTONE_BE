const { z } = require('zod');

// Regex cho email Gmail 
const GMAIL_REGEX = new RegExp(
    /^([a-z0-9](?:[a-z0-9]|[a-z0-9]\.){4,28}[a-z0-9])@gmail\.com$/i
);

// --- SCHEMAS CHÍNH

const registerSchema = z.object({
    email: z.string().toLowerCase().trim().regex(GMAIL_REGEX, { 
        message: "Email không hợp lệ. Chỉ chấp nhận định dạng @gmail.com (a-z, 0-9, .), dài 6-30 ký tự và không bắt đầu/kết thúc bằng dấu chấm." 
    }),
    password: z.string().min(6, { message: "Mật khẩu phải có ít nhất 6 ký tự" }),
    fullName: z.string().min(1, { message: "Họ và tên không được để trống" }),
    phone: z.string().min(8).max(20).optional()
});

const loginSchema = z.object({
    email: z.string().toLowerCase().trim().regex(GMAIL_REGEX, { 
        message: "Email không hợp lệ. Vui lòng sử dụng địa chỉ @gmail.com hợp lệ." 
    }),
    password: z.string().min(6, { message: "Mật khẩu phải có ít nhất 6 ký tự" })
});


// --- SCHEMAS XÁC MINH/RESET PASSWORD (Hợp nhất Logic & Tên gọi) ---

// Schema cho việc gửi email (Quên mật khẩu / Gửi lại OTP)
const emailSchema = z.object({
    email: z.string().toLowerCase().trim().regex(GMAIL_REGEX, { 
        message: "Email không hợp lệ. Vui lòng sử dụng địa chỉ @gmail.com hợp lệ." 
    })
});

// Schema cho xác minh OTP
const verifyOtpSchema = z.object({
    email: z.string().toLowerCase().trim().regex(GMAIL_REGEX, { 
        message: "Email không hợp lệ." 
    }),
    otp: z.string()
        .length(6, { message: "Mã OTP phải có 6 chữ số." })
        .regex(/^[0-9]+$/, { message: "Mã OTP chỉ được chứa chữ số." })
});

// Schema cho Reset Password (sửa code để khớp với OTP 6 số)
const resetPasswordSchema = z.object({
    email: z.string().toLowerCase().trim().regex(GMAIL_REGEX, { 
        message: "Email không hợp lệ." 
    }),
    code: z.string().trim().length(6, "Mã xác minh phải có đúng 6 chữ số."),
    newPassword: z.string().min(6, "Mật khẩu mới phải có ít nhất 6 ký tự"),
    confirmPassword: z.string().min(6, "Xác nhận mật khẩu phải có ít nhất 6 ký tự")
})
.refine((data) => data.newPassword === data.confirmPassword, {
    message: "Mật khẩu mới và xác nhận mật khẩu không khớp",
    path: ["confirmPassword"]
});


//  SCHEMAS QUẢN LÝ HỒ SƠ 

const updateProfileSchema = z.object({
    fullName: z.string().min(1, { message: "Họ và tên không được để trống" }).optional(),
    phone: z.string().min(8).max(20).optional().nullable(),
    avatar: z.string().url("URL Avatar không hợp lệ").optional().nullable(),
    description: z.string().max(500, "Mô tả không được vượt quá 500 ký tự").optional().nullable()
});

const changePasswordSchema = z.object({
    currentPassword: z.string().min(6, "Mật khẩu hiện tại phải có ít nhất 6 ký tự"),
    newPassword: z.string().min(6, "Mật khẩu mới phải có ít nhất 6 ký tự"),
    confirmPassword: z.string().min(6, "Xác nhận mật khẩu phải có ít nhất 6 ký tự")
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