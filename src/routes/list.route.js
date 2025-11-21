const router = require('express').Router();
const { auth } = require('../middleware/auth');
const { 
    createList, 
    getBoardLists, 
    updateList, 
    deleteList, 
    reorderLists 
} = require('../controllers/list.controller');


router.use(auth(true));

// Tạo List 
router.post('/', createList); 

// Lấy tất cả Lists của một Board
router.get('/board/:boardId', getBoardLists);

// Cập nhật List 
router.patch('/:listId', updateList);

// Xóa List 
router.delete('/:listId', deleteList);

// Sắp xếp lại Lists 
router.post('/reorder', reorderLists); 


module.exports = router;