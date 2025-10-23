const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createBoard, getBoard, renameBoard, deleteBoard } = require('../controllers/board.controller');


router.use(auth(true));
router.post('/', createBoard);
router.get('/:boardId', getBoard);
router.put('/:boardId/rename', renameBoard);
router.delete('/:boardId', deleteBoard);


module.exports = router;