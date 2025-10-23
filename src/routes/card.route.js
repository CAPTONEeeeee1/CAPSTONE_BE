
const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { createCard,listCardsByList, getCard, updateCard, deleteCard, moveCard } = require('../controllers/card.controller');


router.use(auth(true));
router.post('/', createCard);
router.get('/:cardId', getCard);
router.patch('/:cardId', updateCard);
router.delete('/:cardId', deleteCard);
router.post('/:cardId/move', moveCard);
router.get('/list/:listId', listCardsByList);

module.exports = router;