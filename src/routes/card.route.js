
const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createCard,listCardsByList, getCard, updateCard, deleteCard, moveCard, assignCardMember, removeCardMember, getCardAttachments, deleteAttachment } = require('../controllers/card.controller');


router.use(auth(true));
router.post('/', createCard);
router.get('/:cardId', getCard);
router.patch('/:cardId', updateCard);
router.delete('/:cardId', deleteCard);
router.post('/:cardId/move', moveCard);
router.get('/list/:listId', listCardsByList);
router.post('/:cardId/assign', assignCardMember);
router.delete('/:cardId/member/:userId', removeCardMember);
router.get('/:cardId/attachments', getCardAttachments);
router.delete('/:cardId/attachments/:attachmentId', deleteAttachment);

module.exports = router;