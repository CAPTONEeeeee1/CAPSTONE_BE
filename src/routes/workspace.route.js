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
// Cập nhật thông tin Workspace 
router.patch('/:workspaceId', updateWorkspace);
// Xóa Workspace 
router.delete('/:workspaceId', deleteWorkspace);

// --- TRUY VẤN DỮ LIỆU CỦA WORKSPACE (ID/BOARDS) ---
// Lấy thông tin chi tiết Workspace theo ID 
router.get('/:id', getWorkspaceById); 
// Lấy danh sách Boards của Workspace 
router.get('/:id/boards', getWorkspaceBoards); 

// --- QUẢN LÝ THÀNH VIÊN & VAI TRÒ ---
// Lấy danh sách thành viên (Dùng :workspaceId để thống nhất với các route quản lý khác)
router.get('/:workspaceId/members', getWorkspaceMembers); 
// Mời thành viên 
router.post('/:workspaceId/invite', inviteMember);
// Xóa thành viên 
router.delete('/:workspaceId/member/:userId', removeMember);
// Thay đổi vai trò thành viên 
router.patch('/:workspaceId/member/:userId/role', updateMemberRole);
// Rời khỏi Workspace 
router.post('/:workspaceId/leave', leaveWorkspace);

// --- QUẢN LÝ LỜI MỜI ---
// Xem các lời mời đang chờ 
router.get('/invitations', listMyInvitations);
router.post('/invitations/:invitationId/accept', acceptInvitation);
router.post('/invitations/:invitationId/reject', rejectInvitation);


module.exports = router;