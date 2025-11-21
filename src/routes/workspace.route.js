const router = require('express').Router();
const { auth } = require('../middleware/auth');
const {
    createWorkspace,
    listMyWorkspaces,
    getWorkspaceById,
    getWorkspaceBoards,
    getWorkspaceMembers,
} = require('../controllers/workspace.controller');


router.use(auth(true));
router.post('/', createWorkspace);
router.get('/', listMyWorkspaces);
router.get('/:id', getWorkspaceById);
router.get('/:id/boards', getWorkspaceBoards);
router.get('/:id/members', getWorkspaceMembers);


module.exports = router;