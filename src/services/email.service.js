const nodemailer = require('nodemailer');

// SỬA LỖI: Sử dụng đúng biến môi trường từ tệp .env của bạn (EMAIL_USER và EMAIL_PASS)
const EMAIL_SERVICE = process.env.EMAIL_SERVICE || 'gmail';
const EMAIL_SENDER = process.env.EMAIL_USER; // Thay vì EMAIL_SENDER
const EMAIL_APP_PASSWORD = process.env.EMAIL_PASS; // Thay vì EMAIL_APP_PASSWORD
const OTP_EXPIRES_MINUTES = parseInt(process.env.OTP_EXPIRES_MINUTES || '10', 10);
const NODE_ENV = process.env.NODE_ENV;

// Tạo Nodemailer transporter (chỉ cần tạo một lần)
const transporter = nodemailer.createTransport({
    service: EMAIL_SERVICE,
    auth: {
        user: EMAIL_SENDER,
        pass: EMAIL_APP_PASSWORD
    }
});

/**
 * Gửi email chung cho bất kỳ mục đích nào.
 * @param {object} options - Tùy chọn email (to, subject, html).
 */
async function sendEmail({ to, subject, html }) {
    if (NODE_ENV !== 'production' && !EMAIL_SENDER) {
        console.error("LỖI CẤU HÌNH: EMAIL_SENDER không được định nghĩa. Không thể gửi email.");
        return { success: false, error: "EMAIL_SENDER not configured." };
    }

    try {
        await transporter.sendMail({
            from: `"PlanNex" <${EMAIL_SENDER}>`,
            to,
            subject,
            html
        });
        console.log(`Email sent successfully to ${to}`);
        return { success: true };
    } catch (error) {
        console.error('Email send error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Template Email: Lời mời tham gia Workspace
 */
function getWorkspaceInvitationEmailTemplate(workspace, inviterName, acceptUrl) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
                .button:hover { background: #0056b3; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🎉 Lời mời tham gia Workspace</h2>
                <p>Xin chào,</p>
                <p><strong>${inviterName}</strong> đã mời bạn tham gia workspace <strong>${workspace.name}</strong> trên PlanNex.</p>
                ${workspace.description ? `<p><em>${workspace.description}</em></p>` : ''}
                <p>
                    <a href="${acceptUrl}" class="button">Chấp nhận lời mời</a>
                </p>
                <p>Hoặc copy link sau vào trình duyệt:<br>${acceptUrl}</p>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex. Nếu bạn không yêu cầu, vui lòng bỏ qua.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Nhiệm vụ được giao
 */
function getTaskAssignedEmailTemplate(task, assignerName, taskUrl) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .task-info { background: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 20px 0; }
                .button { display: inline-block; padding: 12px 24px; background: #28a745; color: white; text-decoration: none; border-radius: 5px; }
                .priority { display: inline-block; padding: 3px 8px; border-radius: 3px; font-size: 12px; font-weight: bold; }
                .priority-high { background: #dc3545; color: white; }
                .priority-medium { background: #ffc107; color: #000; }
                .priority-low { background: #17a2b8; color: white; }
                .priority-urgent { background: #ff0000; color: white; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>✅ Bạn được giao nhiệm vụ mới</h2>
                <p><strong>${assignerName}</strong> đã giao nhiệm vụ cho bạn.</p>
                <div class="task-info">
                    <h3>${task.title}</h3>
                    ${task.description ? `<p>${task.description}</p>` : ''}
                    <p>
                        <strong>Độ ưu tiên:</strong> 
                        <span class="priority priority-${task.priority.toLowerCase()}">${task.priority.toUpperCase()}</span>
                    </p>
                    ${task.dueDate ? `<p><strong>Hạn hoàn thành:</strong> ${new Date(task.dueDate).toLocaleString('vi-VN')}</p>` : ''}
                </div>
                <p>
                    <a href="${taskUrl}" class="button">Xem chi tiết nhiệm vụ</a>
                </p>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Phản hồi lời mời workspace
 */
function getInvitationResponseEmailTemplate(workspace, responderName, accepted) {
    const status = accepted ? 'đã chấp nhận' : 'đã từ chối';
    const emoji = accepted ? '✅' : '❌';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .status-box { background: ${accepted ? '#d4edda' : '#f8d7da'}; color: ${accepted ? '#155724' : '#721c24'}; padding: 15px; border-radius: 5px; margin: 20px 0; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>${emoji} Phản hồi lời mời workspace</h2>
                <div class="status-box">
                    <p><strong>${responderName}</strong> ${status} lời mời tham gia workspace <strong>${workspace.name}</strong>.</p>
                </div>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Workspace đã bị xóa
 */
function getWorkspaceDeletedEmailTemplate(workspaceName) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                .alert-box { background: #f8d7da; color: #721c24; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0; }
                .footer { margin-top: 20px; font-size: 12px; color: #777; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🗑️ Workspace đã bị xóa</h2>
                <div class="alert-box">
                    <p>Workspace <strong>"${workspaceName}"</strong> mà bạn là thành viên đã bị xóa.</p>
                </div>
                <p>Mọi dữ liệu liên quan đến workspace này đã không còn khả dụng.</p>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Board mới được tạo
 */
function getBoardCreatedEmailTemplate(boardName, creatorName, workspaceName, boardUrl) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                .info-box { background: #e7f3ff; color: #0056b3; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0; }
                .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
                .button:hover { background: #0056b3; }
                .footer { margin-top: 20px; font-size: 12px; color: #777; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>✨ Board mới được tạo!</h2>
                <div class="info-box">
                    <p><strong>${creatorName}</strong> đã tạo board <strong>"${boardName}"</strong> trong workspace <strong>"${workspaceName}"</strong>.</p>
                </div>
                <p>Hãy cùng khám phá board mới này và bắt đầu sắp xếp công việc!</p>
                <a href="${boardUrl}" class="button">Xem Board</a>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Board mới được tạo
 */
function getBoardCreatedEmailTemplate(boardName, creatorName, workspaceName, boardUrl) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                .info-box { background: #e7f3ff; color: #0056b3; padding: 15px; border-left: 4px solid #2196F3; margin: 20px 0; }
                .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
                .button:hover { background: #0056b3; }
                .footer { margin-top: 20px; font-size: 12px; color: #777; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>✨ Board mới được tạo!</h2>
                <div class="info-box">
                    <p><strong>${creatorName}</strong> đã tạo board <strong>"${boardName}"</strong> trong workspace <strong>"${workspaceName}"</strong>.</p>
                </div>
                <p>Hãy cùng khám phá board mới này và bắt đầu sắp xếp công việc!</p>
                <a href="${boardUrl}" class="button">Xem Board</a>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Board đã bị xóa
 */
function getBoardDeletedEmailTemplate(boardName, deleterName, workspaceName) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                .alert-box { background: #f8d7da; color: #721c24; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0; }
                .footer { margin-top: 20px; font-size: 12px; color: #777; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🗑️ Board đã bị xóa</h2>
                <div class="alert-box">
                    <p>Board <strong>"${boardName}"</strong> trong workspace <strong>"${workspaceName}"</strong> đã bị xóa bởi <strong>${deleterName}</strong>.</p>
                </div>
                <p>Mọi dữ liệu liên quan đến board này đã không còn khả dụng.</p>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Bị xóa khỏi Workspace
 */
function getMemberRemovedEmailTemplate(workspaceName, removerName) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                .alert-box { background: #f8d7da; color: #721c24; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0; }
                .footer { margin-top: 20px; font-size: 12px; color: #777; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>🗑️ Bạn đã bị xóa khỏi Workspace</h2>
                <div class="alert-box">
                    <p>Bạn đã bị xóa khỏi workspace <strong>"${workspaceName}"</strong> bởi <strong>${removerName}</strong>.</p>
                </div>
                <p>Bạn không còn quyền truy cập vào workspace này nữa.</p>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

function getOTPEmailTemplate(fullName, otp) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 28px; }
                .content { padding: 40px 30px; }
                .otp-box { background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; border: 3px solid #667eea; }
                .otp-code { font-size: 48px; font-weight: bold; color: #667eea; letter-spacing: 8px; font-family: 'Courier New', monospace; text-shadow: 2px 2px 4px rgba(0,0,0,0.1); }
                .otp-label { font-size: 14px; color: #666; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 2px; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e9ecef; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .info-box { background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Mã Xác Thực OTP</h1>
                </div>
                <div class="content">
                    <p>Xin chào <strong>${fullName}</strong>,</p>
                    <p>Cảm ơn bạn đã đăng ký tài khoản PlanNex!</p>
                    <p>Đây là mã OTP để xác thực email của bạn:</p>
                    
                    <div class="otp-box">
                        <div class="otp-label">Mã OTP của bạn</div>
                        <div class="otp-code">${otp}</div>
                    </div>
                    
                    <div class="info-box">
                        <p style="margin: 0;"><strong>📱 Cách sử dụng:</strong></p>
                        <p style="margin: 10px 0 0 0;">Nhập mã OTP này vào trang xác thực để hoàn tất đăng ký tài khoản.</p>
                    </div>
                    
                    <div class="warning">
                        <p><strong>⚠️ Lưu ý quan trọng:</strong></p>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Mã OTP có hiệu lực trong <strong>${OTP_EXPIRES_MINUTES} phút</strong></li>
                            <li>Bạn có <strong>5 lần thử</strong> để nhập đúng mã</li>
                            <li>Không chia sẻ mã này với bất kỳ ai</li>
                            <li>Nếu bạn không yêu cầu mã này, vui lòng bỏ qua email</li>
                        </ul>
                    </div>
                </div>
                <div class="footer">
                    <p>Email này được gửi từ <strong>PlanNex</strong></p>
                    <p>Nếu bạn gặp vấn đề, vui lòng liên hệ support@plannex.com</p>
                    <p style="margin-top: 10px; color: #999;">© 2025 PlanNex. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Mã đặt lại mật khẩu
 */
function getPasswordResetCodeEmailTemplate(fullName, resetCode) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 40px 20px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 28px; }
                .content { padding: 40px 30px; }
                .code-box { background: linear-gradient(135deg, #fff5f5 0%, #ffe0e0 100%); padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; border: 3px solid #dc3545; }
                .code { font-size: 48px; font-weight: bold; color: #dc3545; letter-spacing: 8px; font-family: 'Courier New', monospace; text-shadow: 2px 2px 4px rgba(0,0,0,0.1); }
                .code-label { font-size: 14px; color: #666; margin-bottom: 15px; text-transform: uppercase; letter-spacing: 2px; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e9ecef; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .info-box { background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔑 Mã Đặt Lại Mật Khẩu</h1>
                </div>
                <div class="content">
                    <p>Xin chào <strong>${fullName}</strong>,</p>
                    <p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản PlanNex của bạn.</p>
                    <p>Đây là mã xác nhận để đặt lại mật khẩu:</p>
                    
                    <div class="code-box">
                        <div class="code-label">Mã đặt lại mật khẩu</div>
                        <div class="code">${resetCode}</div>
                    </div>
                    
                    <div class="info-box">
                        <p style="margin: 0;"><strong>📱 Cách sử dụng:</strong></p>
                        <p style="margin: 10px 0 0 0;">Nhập mã này vào trang xác nhận để tiếp tục đặt lại mật khẩu.</p>
                    </div>
                    
                    <div class="warning">
                        <p><strong>⚠️ Lưu ý quan trọng:</strong></p>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Mã có hiệu lực trong <strong>${OTP_EXPIRES_MINUTES} phút</strong></li>
                            <li>Không chia sẻ mã này với bất kỳ ai</li>
                            <li>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này</li>
                            <li>Để bảo mật tài khoản, hãy đổi mật khẩu ngay sau khi nhận được email này</li>
                        </ul>
                    </div>
                </div>
                <div class="footer">
                    <p>Email này được gửi từ <strong>PlanNex</strong></p>
                    <p>Nếu bạn gặp vấn đề, vui lòng liên hệ support@plannex.com</p>
                    <p style="margin-top: 10px; color: #999;">© 2025 PlanNex. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Thông báo đổi mật khẩu thành công
 */
function getPasswordChangedEmailTemplate(fullName, changeTime, ipAddress, userAgent) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 20px auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #28a745 0%, #20c997 100%); padding: 40px 20px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 28px; }
                .content { padding: 40px 30px; }
                .success-box { background: linear-gradient(135deg, #d4edda 0%, #c3e6cb 100%); padding: 30px; border-radius: 12px; text-align: center; margin: 30px 0; border: 3px solid #28a745; }
                .success-icon { font-size: 64px; margin-bottom: 10px; }
                .info-box { background: #e7f3ff; border-left: 4px solid #2196F3; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .info-item { display: flex; margin: 10px 0; }
                .info-label { font-weight: bold; min-width: 120px; color: #555; }
                .info-value { color: #333; }
                .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e9ecef; }
                .button { display: inline-block; padding: 12px 30px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; margin-top: 15px; }
                .button:hover { background: #0056b3; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🔐 Mật Khẩu Đã Được Thay Đổi</h1>
                </div>
                <div class="content">
                    <p>Xin chào <strong>${fullName}</strong>,</p>
                    
                    <div class="success-box">
                        <div class="success-icon">✅</div>
                        <h2 style="color: #28a745; margin: 10px 0;">Thành công!</h2>
                        <p style="margin: 10px 0; color: #155724;">Mật khẩu của bạn đã được cập nhật thành công.</p>
                    </div>
                    
                    <p>Mật khẩu tài khoản PlanNex của bạn vừa được thay đổi. Nếu đây là hành động của bạn, bạn có thể bỏ qua email này.</p>
                    
                    <div class="info-box">
                        <p style="margin: 0 0 15px 0;"><strong>📋 Thông tin thay đổi:</strong></p>
                        <div class="info-item">
                            <span class="info-label">⏰ Thời gian:</span>
                            <span class="info-value">${changeTime}</span>
                        </div>
                        ${ipAddress ? `
                        <div class="info-item">
                            <span class="info-label">🌐 Địa chỉ IP:</span>
                            <span class="info-value">${ipAddress}</span>
                        </div>
                        ` : ''}
                        ${userAgent ? `
                        <div class="info-item">
                            <span class="info-label">💻 Thiết bị:</span>
                            <span class="info-value">${userAgent}</span>
                        </div>
                        ` : ''}
                    </div>
                    
                    <div class="warning">
                        <p><strong>⚠️ Nếu bạn không thực hiện thay đổi này:</strong></p>
                        <ul style="margin: 10px 0; padding-left: 20px;">
                            <li>Tài khoản của bạn có thể đã bị xâm nhập</li>
                            <li>Vui lòng đặt lại mật khẩu ngay lập tức</li>
                            <li>Kiểm tra các hoạt động gần đây trong tài khoản</li>
                            <li>Liên hệ với bộ phận hỗ trợ nếu cần thiết</li>
                        </ul>
                        <p style="text-align: center; margin-top: 20px;">
                            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password" class="button">Đặt Lại Mật Khẩu</a>
                        </p>
                    </div>
                    
                    <p style="margin-top: 30px;"><strong>💡 Mẹo bảo mật:</strong></p>
                    <ul style="color: #666;">
                        <li>Sử dụng mật khẩu mạnh và duy nhất cho mỗi tài khoản</li>
                        <li>Kích hoạt xác thực hai yếu tố nếu có thể</li>
                        <li>Không chia sẻ mật khẩu với bất kỳ ai</li>
                        <li>Thay đổi mật khẩu định kỳ</li>
                    </ul>
                </div>
                <div class="footer">
                    <p>Email này được gửi từ <strong>PlanNex</strong></p>
                    <p>Nếu bạn cần hỗ trợ, vui lòng liên hệ support@plannex.com</p>
                    <p style="margin-top: 10px; color: #999;">© 2025 PlanNex. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

/**
 * Template Email: Tài khoản bị đình chỉ
 */
function getUserSuspendedEmailTemplate(userName) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
                .alert-box { background: #f8d7da; color: #721c24; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0; }
                .footer { margin-top: 20px; font-size: 12px; color: #777; }
                .contact-info { margin-top: 15px; padding-top: 15px; border-top: 1px solid #e0e0e0; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>️Tài khoản của bạn đã bị đình chỉ</h2>
                <div class="alert-box">
                    <p>Xin chào <strong>${userName}</strong>,</p>
                    <p>Tài khoản của bạn tại PlanNex đã bị đình chỉ do vi phạm chính sách của chúng tôi. Bạn sẽ không thể đăng nhập vào tài khoản của mình.</p>
                    <div class="contact-info">
                        <p>Nếu bạn cho rằng đây là một sự nhầm lẫn, vui lòng liên hệ với bộ phận hỗ trợ của chúng tôi qua:</p>
                        <ul>
                            <li><strong>Gmail:</strong> authplannex@gmail.com</li>
                            <li><strong>Zalo:</strong> 0901993313</li>
                        </ul>
                    </div>
                </div>
                <div class="footer">
                    <p>Email này được gửi từ PlanNex.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}


module.exports = {
    sendEmail,
    getWorkspaceInvitationEmailTemplate,
    getTaskAssignedEmailTemplate,
    getInvitationResponseEmailTemplate,
    getOTPEmailTemplate,
    getPasswordResetCodeEmailTemplate,
    getPasswordChangedEmailTemplate,
    getWorkspaceDeletedEmailTemplate,
    getBoardCreatedEmailTemplate,
    getBoardDeletedEmailTemplate,
    getMemberRemovedEmailTemplate,
    getUserSuspendedEmailTemplate
};