const express = require('express');
const { auth } = require('../middleware/auth');
const {
    getMyNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    getNotificationSettings,
    updateNotificationSettings,
    getUnreadCount
} = require('../controllers/notification.controller');

const router = express.Router();

router.get('/unread-count', auth(), getUnreadCount);
router.get('/settings', auth(), getNotificationSettings);
router.put('/settings', auth(), updateNotificationSettings);
router.put('/read-all', auth(), markAllAsRead);
router.get('/', auth(), getMyNotifications);
router.put('/:notificationId/read', auth(), markAsRead);
router.delete('/:notificationId', auth(), deleteNotification);

module.exports = router;
