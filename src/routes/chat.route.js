const express = require('express');
const router = express.Router();
const { getConversations, getMessages } = require('../controllers/chat.controller');
const { auth } = require('../middleware/auth');

router.get('/conversations/:workspaceId', auth, getConversations);
router.get('/messages/:conversationId', auth, getMessages);

module.exports = router;
