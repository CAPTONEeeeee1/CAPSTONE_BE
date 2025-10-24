const nodemailer = require('nodemailer');

// Lấy thông tin tài khoản email từ biến môi trường
const { 
    EMAIL_USER, 
    EMAIL_PASS,
    NODE_ENV 
} = process.env;

// Tạo Nodemailer transporter (sử dụng Gmail SMTP)
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS, // Đây phải là App Password (Mật khẩu ứng dụng) nếu dùng Gmail
    },
    // Nếu gặp lỗi, thêm tùy chọn bảo mật:
    // secure: true,
    // port: 465,
});

/**
 * Gửi email xác minh (OTP) đến người dùng.
 * @param {string} email - Địa chỉ email người nhận.
 * @param {string} otp - Mã OTP 6 chữ số.
 * @param {string} fullName - Tên đầy đủ của người dùng.
 */
async function sendVerificationEmail(email, otp, fullName) {
    // ⚠️ LƯU Ý QUAN TRỌNG: 
    // Nếu bạn sử dụng Gmail, bạn phải sử dụng MẬT KHẨU ỨNG DỤNG (App Password)
    // thay vì mật khẩu tài khoản thông thường.

    if (NODE_ENV !== 'production' && !EMAIL_USER) {
        console.error("LỖI CẤU HÌNH: EMAIL_USER không được định nghĩa. Không thể gửi email.");
        return;
    }
    
    // Thiết lập nội dung email
    const mailOptions = {
        from: `PlanNex Account <${EMAIL_USER}>`,
        to: email,
        subject: 'Mã xác minh tài khoản PlanNex (OTP)',
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 600px; margin: auto;">
                <h2 style="color: #007bff;">Xin chào ${fullName},</h2>
                <p>Cảm ơn bạn đã đăng ký tài khoản PlanNex. Vui lòng sử dụng mã xác minh (OTP) dưới đây để hoàn tất quá trình kích hoạt tài khoản của bạn:</p>
                
                <div style="text-align: center; margin: 30px 0;">
                    <span style="font-size: 32px; font-weight: bold; color: #dc3545; background-color: #f8f9fa; padding: 15px 30px; border-radius: 8px; letter-spacing: 5px;">
                        ${otp}
                    </span>
                </div>
                
                <p>Mã này chỉ có hiệu lực trong vài phút. Vui lòng không chia sẻ mã này với bất kỳ ai.</p>
                <p>Trân trọng,<br>Đội ngũ PlanNex</p>
            </div>
        `,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log("Email đã gửi: %s", info.messageId);
    } catch (error) {
        console.error("LỖI GỬI EMAIL THỰC TẾ:", error);
        throw new Error('Không thể gửi mã xác minh. Vui lòng kiểm tra email server.');
    }
}

module.exports = { sendVerificationEmail };
