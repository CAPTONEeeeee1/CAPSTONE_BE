const router = require('express').Router();
const { auth } = require('../middleware/auth');
const {
    listComments, addComment, updateComment, deleteComment
} = require('../controllers/comment.controller');

router.use(auth(true));

router.get('/:cardId', listComments);
router.post('/:cardId', addComment);

router.patch('/:commentId', updateComment);
router.delete('/:commentId', deleteComment);

module.exports = router;