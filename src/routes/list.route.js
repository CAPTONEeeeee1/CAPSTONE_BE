const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createList, updateList, deleteList, reorderLists } = require('../controllers/list.controller');


router.use(auth(true));
router.post('/', createList);
router.patch('/:listId', updateList);
router.delete('/:listId', deleteList);
router.post('/reorder', reorderLists);


module.exports = router;