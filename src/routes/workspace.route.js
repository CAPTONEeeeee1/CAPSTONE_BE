const router = require('express').Router();
const { auth } = require('../middleware/auth');
const {
    createWorkspace,
    listMyWorkspaces,
    getWorkspaceById,       
    getWorkspaceBoards,     
    getWorkspaceMembers,    
    updateWorkspace,        
    deleteWorkspace,        
    leaveWorkspace,         
    inviteMember,           
    acceptInvitation,       
    rejectInvitation,       
    listMyInvitations,      
    removeMember,           
    updateMemberRole,       
} = require('../controllers/workspace.controller');


router.use(auth(true));

// --- CƠ SỞ (CREATE/LIST) ---
router.post('/', createWorkspace);
router.get('/', listMyWorkspaces);

// --- QUẢN LÝ WORKSPACE (CRUD) ---
// Lấy thông tin chi tiết Workspace theo ID (SỬA LỖI: Thống nhất dùng :workspaceId)
router.get('/:workspaceId', getWorkspaceById);
// Cập nhật thông tin Workspace
router.patch('/:workspaceId', updateWorkspace);
// Xóa Workspace
router.delete('/:workspaceId', deleteWorkspace);

// --- TRUY VẤN DỮ LIỆU CỦA WORKSPACE ---
// Lấy danh sách Boards của Workspace (SỬA LỖI: Thống nhất dùng :workspaceId)
router.get('/:workspaceId/boards', getWorkspaceBoards);
// Lấy danh sách thành viên
router.get('/:workspaceId/members', getWorkspaceMembers);

// --- QUẢN LÝ THÀNH VIÊN & VAI TRÒ ---
// Mời thành viên (SỬA LỖI: Đổi thành /invitations để khớp với FE)
router.post('/:workspaceId/invitations', inviteMember);
// Xóa thành viên (SỬA LỖI: Chuẩn hóa thành /members/:userId)
router.delete('/:workspaceId/members/:userId', removeMember);
// Thay đổi vai trò thành viên (SỬA LỖI: Chuẩn hóa thành /members/:userId/role)
router.patch('/:workspaceId/members/:userId/role', updateMemberRole);
// Rời khỏi Workspace
router.post('/:workspaceId/leave', leaveWorkspace);

// --- QUẢN LÝ LỜI MỜI ---
// Xem các lời mời đang chờ của người dùng (SỬA LỖI: Đặt route này ở cuối để tránh xung đột)
router.get('/invitations/me', listMyInvitations);
router.post('/invitations/:invitationId/accept', acceptInvitation);
router.post('/invitations/:invitationId/reject', rejectInvitation);


module.exports = router;