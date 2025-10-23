const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createWorkspace, listMyWorkspaces, inviteMember } = require('../controllers/workspace.controller');


router.use(auth(true));
router.post('/', createWorkspace);
router.get('/', listMyWorkspaces);
router.post('/:workspaceId/invite', inviteMember);


module.exports = router;