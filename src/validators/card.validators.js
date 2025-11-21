const { z } = require('zod');

// Lược đồ cho cấu trúc một đính kèm (Attachment)
const attachmentSchema = z.object({
    fileName: z.string().min(1, 'Tên tệp không được để trống.'),
    fileSize: z.number().int().positive('Kích thước tệp phải là số dương.'),
    mimeType: z.string().min(1, 'Mime type không được để trống.'),
    fileUrl: z.string().url('URL tệp không hợp lệ.')
});

// Schema để tạo Card mới
const createCardSchema = z.object({
    boardId: z.string().min(1, 'ID Board không được để trống.'),
    listId: z.string().min(1, 'ID List không được để trống.'),
    title: z.string().min(1, 'Tiêu đề Card không được để trống.'),
    description: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent'], {
        message: "Priority phải là 'low', 'medium', 'high', hoặc 'urgent'."
    }).optional(),
    dueDate: z.string().datetime('Định dạng DueDate không hợp lệ (cần ISO 8601).').optional(),
    startDate: z.string().datetime('Định dạng StartDate không hợp lệ (cần ISO 8601).').optional(),
    assigneeIds: z.array(z.string().min(1)).optional(),
    labelIds: z.array(z.string().min(1)).optional(),
    // Thêm mảng attachments vào Card
    attachments: z.array(attachmentSchema).optional(),
    custom: z.any().optional()
});

// Schema để cập nhật Card
const updateCardSchema = z.object({
    title: z.string().min(1, 'Tiêu đề Card không được để trống.').optional(),
    description: z.string().optional(),
    dueDate: z.string().datetime('Định dạng DueDate không hợp lệ (cần ISO 8601).').optional(),
    startDate: z.string().datetime('Định dạng StartDate không hợp lệ (cần ISO 8601).').optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent'], {
        message: "Priority phải là 'low', 'medium', 'high', hoặc 'urgent'."
    }).optional(),
    listId: z.string().optional(),
    orderIdx: z.number().int().optional(),
    // Thêm mảng attachments vào Update Card
    attachments: z.array(attachmentSchema).optional(),
    custom: z.any().optional()
});

// Schema để di chuyển Card (chỉ cần List ID và Index)
const moveCardSchema = z.object({
    toListId: z.string().min(1, 'ID List đích không được để trống.'),
    toIndex: z.number().int().nonnegative('Index phải là số nguyên không âm.')
});

// Schema để gán (assign) thành viên vào Card
const assignMemberSchema = z.object({
    userId: z.string().min(1, 'ID người dùng không được để trống.')
});


module.exports = { 
    createCardSchema, 
    updateCardSchema, 
    moveCardSchema, 
    assignMemberSchema, 
    attachmentSchema 
};