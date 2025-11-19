const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createList, getBoardLists, updateList, deleteList, reorderLists } = require('../controllers/list.controller');

router.use(auth(true));

router.post('/create-list', createList);
router.get('/board/:boardId', getBoardLists);
router.patch('/update-list/:listId', updateList);
router.delete('/delete-list/:listId', deleteList);

router.post('/reorder-lists', reorderLists);

module.exports = router;