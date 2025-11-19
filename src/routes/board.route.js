const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createBoard, getWorkSpaceBoards, getBoard, renameBoard, deleteBoard, togglePinBoard } = require('../controllers/board.controller');


router.use(auth(true));
router.post('/', createBoard);
router.get('/workspace/:workspaceId', getWorkSpaceBoards);
router.get('/:boardId', getBoard);
router.put('/:boardId/rename', renameBoard);
router.delete('/:boardId', deleteBoard);
router.patch('/:boardId/pin', togglePinBoard);


module.exports = router;