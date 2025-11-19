const express = require('express');
const { auth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');
const {
    getAllUsers,
    getUserDetail,
    updateUserStatus,
    updateUserRole,
    deleteUser,
    getSystemStats
} = require('../controllers/admin.controller');

const router = express.Router();

router.get('/stats', auth(), requireAdmin, getSystemStats);
router.get('/users', auth(), requireAdmin, getAllUsers);
router.get('/users/:userId', auth(), requireAdmin, getUserDetail);
router.put('/users/:userId/status', auth(), requireAdmin, updateUserStatus);
router.put('/users/:userId/role', auth(), requireAdmin, updateUserRole);
router.delete('/users/:userId', auth(), requireAdmin, deleteUser);

module.exports = router;
