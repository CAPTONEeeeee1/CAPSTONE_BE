const express = require('express');
const { chatController, upload } = require('../controllers/chat.controller');
const { auth } = require('../middleware/auth');

const router = express.Router();

router.use(auth());

router.get('/workspace/:workspaceId', chatController.getChatByWorkspace.bind(chatController));

router.get('/:chatId/messages', chatController.getMessages.bind(chatController));

router.get('/:chatId/messages/search', chatController.searchMessages.bind(chatController));

router.post('/:chatId/messages', chatController.sendMessage.bind(chatController));

router.post(
  '/:chatId/messages/upload',
  upload.array('files', 5),
  chatController.uploadAttachment.bind(chatController)
);

router.put('/messages/:messageId', chatController.updateMessage.bind(chatController));

router.delete('/messages/:messageId', chatController.deleteMessage.bind(chatController));

router.post('/:chatId/read', chatController.markAsRead.bind(chatController));

router.get('/:chatId/attachments', chatController.getAttachments.bind(chatController));

router.get('/:chatId/members', chatController.getMembers.bind(chatController));

module.exports = router;
