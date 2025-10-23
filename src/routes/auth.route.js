const router = require('express').Router();
const { register, login, refresh, logout, me } = require('../controllers/auth.controller');
const { auth } = require('../middleware/auth');


router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);
router.get('/me', auth(true), me);


module.exports = router;