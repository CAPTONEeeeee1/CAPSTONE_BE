const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createWorkspace, listMyWorkspaces, getWorkspaceMembers ,inviteMember, acceptInvitation, rejectInvitation, listMyInvitations, removeMember, updateWorkspace, deleteWorkspace, leaveWorkspace, updateMemberRole } = require('../controllers/workspace.controller');


router.use(auth(true));
router.post('/', createWorkspace);
router.get('/', listMyWorkspaces);
router.patch('/:workspaceId', updateWorkspace);
router.delete('/:workspaceId', deleteWorkspace);
router.post('/:workspaceId/leave', leaveWorkspace);
router.get('/:workspaceId/members', getWorkspaceMembers);
router.post('/:workspaceId/invite', inviteMember);
router.get('/invitations', listMyInvitations);
router.post('/invitations/:invitationId/accept', acceptInvitation);
router.post('/invitations/:invitationId/reject', rejectInvitation);
router.delete('/:workspaceId/member/:userId', removeMember);
router.patch('/:workspaceId/member/:userId/role', updateMemberRole);


module.exports = router;