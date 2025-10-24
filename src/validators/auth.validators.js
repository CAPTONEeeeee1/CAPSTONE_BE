const { z } = require('zod');

// Regex cho email Gmail (Giữ nguyên)
const GMAIL_REGEX = new RegExp(
    /^([a-z0-9](?:[a-z0-9]|[a-z0-9]\.){4,28}[a-z0-9])@gmail\.com$/i
);

const registerSchema = z.object({
    email: z.string().toLowerCase().regex(GMAIL_REGEX, { 
        message: "Email không hợp lệ. Chỉ chấp nhận định dạng @gmail.com (a-z, 0-9, .), dài 6-30 ký tự và không bắt đầu/kết thúc bằng dấu chấm." 
    }),
    password: z.string().min(6, { message: "Mật khẩu phải có ít nhất 6 ký tự" }),
    fullName: z.string().min(1, { message: "Họ và tên không được để trống" }),
    phone: z.string().min(8).max(20).optional()
});

const loginSchema = z.object({
    email: z.string().toLowerCase().regex(GMAIL_REGEX, { 
        message: "Email không hợp lệ. Vui lòng sử dụng địa chỉ @gmail.com hợp lệ." 
    }),
    password: z.string().min(6)
});


// *** SCHEMA MỚI CHO OTP (Đã thêm) ***
const verifyOtpSchema = z.object({
    email: z.string().toLowerCase().regex(GMAIL_REGEX, { 
        message: "Email không hợp lệ." 
    }),
    otp: z.string()
        .length(6, { message: "Mã OTP phải có 6 chữ số." })
        .regex(/^[0-9]+$/, { message: "Mã OTP chỉ được chứa chữ số." })
});


module.exports = { registerSchema, loginSchema, verifyOtpSchema };