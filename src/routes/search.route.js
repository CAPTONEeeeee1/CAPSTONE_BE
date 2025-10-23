const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { searchCards } = require('../controllers/search.controller');

router.use(auth(true));

router.get('/cards', searchCards);

module.exports = router;