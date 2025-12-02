const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { searchCards, searchWorkspaces, searchBoards } = require('../controllers/search.controller');

router.use(auth(true));

router.get('/cards', searchCards);
router.get('/workspaces', searchWorkspaces);
router.get('/boards', searchBoards);

module.exports = router;