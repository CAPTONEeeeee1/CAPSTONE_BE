const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createBoard, getBoard } = require('../controllers/board.controller');


router.use(auth(true));
router.post('/', createBoard);
router.get('/:boardId', getBoard);


module.exports = router;