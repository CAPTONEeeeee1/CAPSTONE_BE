const express = require('express');
const router = express.Router();
const searchController = require('../controllers/search.controller');
const { auth } = require('../middleware/auth');

// Middleware 'auth()' sẽ đảm bảo rằng chỉ người dùng đã đăng nhập mới có thể truy cập các route này
router.get('/cards', auth(), searchController.searchCards);
router.get('/workspaces', auth(), searchController.searchWorkspaces);
router.get('/boards', auth(), searchController.searchBoards);

module.exports = router;
