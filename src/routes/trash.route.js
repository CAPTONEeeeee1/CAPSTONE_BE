const express = require('express');
const {
    getTrashedBoards,
    restoreBoard,
    permanentlyDeleteBoard,
    getTrashedCardsInWorkspace,
    getTrashedCards,
    restoreCard,
    permanentlyDeleteCard,
    cleanupOldTrash
} = require('../controllers/trash.controller');
const { auth } = require('../middleware/auth');

const router = express.Router();

// All trash routes require authentication
router.use(auth());

// Board trash operations (workspace-level)
router.get('/workspace/:workspaceId/boards', getTrashedBoards);
router.post('/board/:boardId/restore', restoreBoard);
router.delete('/board/:boardId/permanent', permanentlyDeleteBoard);

// Card trash operations
router.get('/workspace/:workspaceId/cards', getTrashedCardsInWorkspace); // All cards in workspace
router.get('/board/:boardId/cards', getTrashedCards); // Cards in specific board
router.post('/card/:cardId/restore', restoreCard);
router.delete('/card/:cardId/permanent', permanentlyDeleteCard);

// Admin cleanup endpoint
router.post('/cleanup', cleanupOldTrash);

module.exports = router;
