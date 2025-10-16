const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createWorkspace, listMyWorkspaces } = require('../controllers/workspace.controller');


router.use(auth(true));
router.post('/', createWorkspace);
router.get('/', listMyWorkspaces);


module.exports = router;