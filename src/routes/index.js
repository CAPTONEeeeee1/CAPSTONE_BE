const express = require('express');
const router = express.Router();

// --- Core authentication & user modules ---
const authRoutes = require('./auth.route');

// --- Core project management modules ---
const workspaceRoutes = require('./workspace.route');
const boardRoutes = require('./board.route');
const listRoutes = require('./list.route');
const cardRoutes = require('./card.route');
const labelRoutes = require('./label.route');
const commentRoutes = require('./comment.route');
const searchRoutes = require('./search.route');

// --- System extensions & admin modules ---
const notificationRoutes = require('./notification.route');
const adminRoutes = require('./admin.route');
const reportRoutes = require('./report.route');
const activityRoutes = require('./activity.route');
const settingRoutes = require('./setting.route');
const chatRoutes = require('./chat.route');

// --- Authentication & User Management ---
router.use('/auth', authRoutes);

// --- Core Project Management ---
router.use('/workspaces', workspaceRoutes);
router.use('/boards', boardRoutes);
router.use('/lists', listRoutes);
router.use('/cards', cardRoutes);
router.use('/labels', labelRoutes);
router.use('/comments', commentRoutes);
router.use('/search', searchRoutes);

// --- Chat System ---
router.use('/chat', chatRoutes);

// --- System & Administration ---
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/reports', reportRoutes);
router.use('/activities', activityRoutes);
router.use('/settings', settingRoutes);

// --- 404 handler (Express 5 compatible) ---
router.use((req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

module.exports = router;
