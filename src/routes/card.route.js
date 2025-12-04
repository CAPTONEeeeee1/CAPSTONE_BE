const router = require('express').Router();
const { auth } = require('../middleware/auth');
const {
    createCard,
    listCardsByList,
    getCard,
    updateCard,
    deleteCard,
    moveCard,
    assignCardMember,
    removeCardMember,
    getCardAttachments,
    deleteAttachment,
    getFilteredCards
} = require('../controllers/card.controller');


router.use(auth(true));

// --- CRUD CƠ BẢN VÀ DI CHUYỂN ---
router.post('/', createCard);
router.get('/board/:boardId/filter', getFilteredCards); // Lọc cards theo board (đặt trước /:cardId)
router.get('/:cardId', getCard);
router.patch('/:cardId', updateCard);
router.delete('/:cardId', deleteCard);
router.post('/:cardId/move', moveCard);
router.get('/list/:listId', listCardsByList); // Lấy danh sách thẻ theo List ID (đặt sau /:cardId để tránh nhầm lẫn route param)


// --- QUẢN LÝ THÀNH VIÊN THẺ (ASSIGNMENT) 
router.post('/:cardId/assign', assignCardMember);
router.delete('/:cardId/member/:userId', removeCardMember);


// --- QUẢN LÝ TỆP ĐÍNH KÈM (ATTACHMENTS)
// Lưu ý: Route POST/upload thường được xử lý ở một controller khác (ví dụ: upload service) 
// và chỉ cần gọi updateCard hoặc createCard nếu liên quan.
router.get('/:cardId/attachments', getCardAttachments);
router.delete('/:cardId/attachments/:attachmentId', deleteAttachment);


module.exports = router;