const { z } = require('zod');

// Schema để tạo Board mới
const createBoardSchema = z.object({
    workspaceId: z.string().min(1, 'ID Workspace không được để trống.'),
    name: z.string().min(1, 'Tên Board không được để trống.'),
    mode: z.enum(['private', 'workspace', 'public'], {
        message: "Mode phải là 'private', 'workspace', hoặc 'public'."
    }).optional(),
    // KeySlug cho phép truy cập nhanh (tối đa 16 ký tự)
    keySlug: z.string().max(16, 'KeySlug không được vượt quá 16 ký tự.').optional()
});

// Schema để đổi tên Board
const renameBoardSchema = z.object({
    name: z.string().min(1, 'Tên mới không được để trống.')
});


module.exports = { createBoardSchema, renameBoardSchema };