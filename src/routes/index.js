const express = require('express');
const router = express.Router();

// --- CORE MODULES (Có trong cả hai phiên bản) ---
const authRoutes = require('./auth.route');
const workspaceRoutes = require('./workspace.route');
const boardRoutes = require('./board.route');
const listRoutes = require('./list.route');
const cardRoutes = require('./card.route');
const labelRoutes = require('./label.route');
const commentRoutes = require('./comment.route');

// --- EXPANDED MODULES (Bổ sung từ >>>>>>> main) ---
const notificationRoutes = require('./notification.route');
const adminRoutes = require('./admin.route');
const reportRoutes = require('./report.route');
const activityRoutes = require('./activity.route');


// --- ĐỊNH NGHĨA ROUTES ---

// Core/Project Management
router.use('/auth', authRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/boards', boardRoutes);
router.use('/lists', listRoutes);
router.use('/cards', cardRoutes);
router.use('/labels', labelRoutes);
router.use('/comments', commentRoutes);

// System/Admin/Reporting (Từ phiên bản mở rộng)
router.use('/notifications', notificationRoutes);
router.use('/admin', adminRoutes);
router.use('/reports', reportRoutes);
router.use('/activities', activityRoutes);


module.exports = router;