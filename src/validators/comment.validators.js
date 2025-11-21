const { z } = require('zod');

// Schema để tạo Comment mới
const createCommentSchema = z.object({ 
    bodyMd: z.string().min(1, 'Nội dung bình luận không được để trống.'),
    // Thêm trường parentId để hỗ trợ bình luận trả lời (nested comments)
    parentId: z.string().optional()
});

// Schema để cập nhật Comment
const updateCommentSchema = z.object({ 
    bodyMd: z.string().min(1, 'Nội dung bình luận không được để trống.') 
});


module.exports = { createCommentSchema, updateCommentSchema };