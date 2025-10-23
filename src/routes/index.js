const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.route');
const workspaceRoutes = require('./workspace.route');
const boardRoutes = require('./board.route');
const listRoutes = require('./list.route');
const cardRoutes = require('./card.route');

const labelRoutes = require('./label.route');
const commentRoutes = require('./comment.route');

router.use('/auth', authRoutes);
router.use('/workspaces', workspaceRoutes);
router.use('/boards', boardRoutes);
router.use('/lists', listRoutes);
router.use('/cards', cardRoutes);
router.use('/labels', labelRoutes);
router.use('/comments', commentRoutes);

module.exports = router;