const { z } = require('zod');

// Schema để tạo Workspace mới
const createWorkspaceSchema = z.object({
    name: z.string().min(1, 'Tên Workspace không được để trống.'),
    description: z.string().optional(),
    visibility: z.enum(['private', 'public'], {
        message: "Visibility phải là 'private' hoặc 'public'."
    }).optional()
});

// Schema để mời thành viên
const inviteMemberSchema = z.object({
    email: z.string().email('Email không hợp lệ.'),
    role: z.enum(['admin', 'member', 'guest'], {
        message: "Role phải là 'admin', 'member', hoặc 'guest'."
    }).optional()
});

// Schema để cập nhật thông tin Workspace
const updateWorkspaceSchema = z.object({
    name: z.string().min(1, 'Tên Workspace không được để trống.').optional(),
    description: z.string().optional(),
    visibility: z.enum(['private', 'public'], {
        message: "Visibility phải là 'private' hoặc 'public'."
    }).optional()
});

// Schema để cập nhật vai trò của thành viên trong Workspace
const updateMemberRoleSchema = z.object({
    role: z.enum(['admin', 'member', 'guest'], {
        message: "Role phải là 'admin', 'member', hoặc 'guest'."
    })
});


module.exports = { createWorkspaceSchema, inviteMemberSchema, updateWorkspaceSchema, updateMemberRoleSchema };