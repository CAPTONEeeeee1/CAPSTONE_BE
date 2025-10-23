const router = require('express').Router();
const { auth } = require('../middleware/auth');
const {
    createLabel, listLabels, updateLabel, deleteLabel,
    addLabelToCard, removeLabelFromCard
} = require('../controllers/label.controller');

router.use(auth(true));


router.get('/', listLabels);          
router.post('/', createLabel);
router.patch('/:labelId', updateLabel);
router.delete('/:labelId', deleteLabel);

router.post('/cards/:cardId', addLabelToCard);              
router.delete('/cards/:cardId/:labelId', removeLabelFromCard);

module.exports = router;
